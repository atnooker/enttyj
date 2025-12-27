
/************************************************************
 *  统计管理器（完整可运行版）
 ***********************************************************/
class StatsManager {
  constructor() {
    this.vocabularies = [];
    this.dailyProgress = {};
    this.reviewSessions = [];
    this.currentTimeFilter = 'week';
    this.charts = {};
  }

  async init() {
    await this.loadData();
    await this.updateOverviewStats();        // ① 加 await
    this.renderCharts();
    this.renderVocabularyStats();
    await this.renderRecentActivity();       // ② 加 await
    await this.renderAchievements();         // ③ 加 await
    this.updateStudyStreak();
    this.animatePageLoad();
  }

  /* ---------------- 数据加载/保存 ---------------- */
  async loadData() {
    this.vocabularies = (await idb.get(idb.STORE_VOCABS, 'wordmaster_vocabularies')) || [];
    this.dailyProgress = (await idb.get(idb.STORE_PROGRESS, 'dailyProgress')) || {};
    this.reviewSessions = (await idb.get(idb.STORE_PROGRESS, 'reviewSessions')) || [];
  }

  /* ---------------- 概览统计（async 版） ---------------- */
  async updateOverviewStats() {
    const stats = await this.calculateOverviewStats();   // 必须 await
    document.getElementById('totalWordsLearned').textContent = stats.totalWords;
    document.getElementById('masteredWordsCount').textContent = stats.masteredWords;
    document.getElementById('totalStudyTime').textContent = Math.round(stats.totalStudyTime / 60);
    document.getElementById('totalReviews').textContent = stats.totalReviews;
    document.getElementById('wordsToday').textContent = '+' + stats.wordsToday;
    document.getElementById('masteryRate').textContent = stats.masteryRate + '%';
    document.getElementById('avgDailyTime').textContent = Math.round(stats.avgDailyTime);
    document.getElementById('reviewAccuracy').textContent = stats.reviewAccuracy + '%';
    document.getElementById('totalStudyDays').textContent = stats.totalStudyDays;
  }

  async calculateOverviewStats() {
    let totalWords = 0, masteredWords = 0, totalStudyTime = 0, totalReviews = 0;
    const today = new Date().toISOString().split('T')[0];

    // 单词
    this.vocabularies.forEach(v =>
      v.units.forEach(u =>
        u.words.forEach(w => {
          totalWords++;
          if (w.mastered) masteredWords++;
        })
      )
    );

    // 复习
    this.reviewSessions.forEach(s => {
      totalReviews += s.totalWords;
      totalStudyTime += s.duration;
    });

    const wordsToday     = this.dailyProgress[today] || 0;
    const masteryRate    = totalWords ? Math.round((masteredWords / totalWords) * 100) : 0;
    const totalStudyDays = Object.keys(this.dailyProgress).length;
    const avgDailyTime   = totalStudyDays ? totalStudyTime / totalStudyDays : 0;

    // ****** 这里必须 await ！******
    const reviewHistory = await idb.get(idb.STORE_PROGRESS, 'reviewHistory') || [];
    const reviewAccuracy = reviewHistory.length
      ? Math.round((reviewHistory.filter(r => r.result === 'familiar').length / reviewHistory.length) * 100)
      : 0;

    return { totalWords, masteredWords, totalStudyTime, totalReviews, wordsToday, masteryRate, avgDailyTime, reviewAccuracy, totalStudyDays };
  }

  /* ---------------- 图表 ---------------- */
  renderCharts() {
    this.renderProgressChart();
    this.renderMasteryChart();
  }

  renderProgressChart() {
    const chartDom = document.getElementById('progressChart');
    if (this.charts.progress) this.charts.progress.dispose();
    this.charts.progress = echarts.init(chartDom);
    const data = this.getProgressChartData();
    this.charts.progress.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } } },
      legend: { data: ['学习单词', '掌握单词'] },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: data.dates },
      yAxis: { type: 'value' },
      series: [
        { name: '学习单词', type: 'line', stack: 'Total', smooth: true, lineStyle: { color: '#3498DB' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(52, 152, 219, 0.3)' }, { offset: 1, color: 'rgba(52, 152, 219, 0.1)' }] } }, data: data.learned },
        { name: '掌握单词', type: 'line', stack: 'Total', smooth: true, lineStyle: { color: '#27AE60' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(39, 174, 96, 0.3)' }, { offset: 1, color: 'rgba(39, 174, 96, 0.1)' }] } }, data: data.mastered }
      ]
    });
  }

  renderMasteryChart() {
    const chartDom = document.getElementById('masteryChart');
    if (this.charts.mastery) this.charts.mastery.dispose();
    this.charts.mastery = echarts.init(chartDom);
    const data = this.getMasteryChartData();
    this.charts.mastery.setOption({
      tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', left: 'left', data: ['已掌握', '学习中', '未学习'] },
      series: [{ name: '掌握度分布', type: 'pie', radius: ['40%', '70%'], center: ['60%', '50%'], avoidLabelOverlap: false, label: { show: false, position: 'center' }, emphasis: { label: { show: true, fontSize: '18', fontWeight: 'bold' } }, labelLine: { show: false }, data: [{ value: data.mastered, name: '已掌握', itemStyle: { color: '#27AE60' } }, { value: data.learning, name: '学习中', itemStyle: { color: '#F39C12' } }, { value: data.new, name: '未学习', itemStyle: { color: '#3498DB' } }] }]
    });
  }

  getProgressChartData() {
    const dates = [], learned = [], mastered = [];
    const endDate = new Date(), startDate = new Date();
    if (this.currentTimeFilter === 'week') startDate.setDate(endDate.getDate() - 6);
    else if (this.currentTimeFilter === 'month') startDate.setDate(endDate.getDate() - 29);
    else {
      const allDates = Object.keys(this.dailyProgress).sort();
      if (allDates.length) startDate.setTime(new Date(allDates[0]).getTime());
      else startDate.setDate(endDate.getDate() - 6);
    }

    let currentDate = new Date(startDate);
    let cumulativeLearned = 0, cumulativeMastered = 0;
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const todayLearned = this.dailyProgress[dateStr] || 0;
      dates.push(dateStr.slice(5));
      cumulativeLearned += todayLearned;
      learned.push(cumulativeLearned);
      mastered.push(this.getMasteredWordsCountToDate(dateStr));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return { dates, learned, mastered };
  }

  getMasteryChartData() {
    let mastered = 0, learning = 0, newWords = 0;
    this.vocabularies.forEach(v =>
      v.units.forEach(u =>
        u.words.forEach(w => {
          if (w.mastered) mastered++;
          else if ((w.familiar || 0) >= 3) learning++;
          else newWords++;
        })
      )
    );
    return { mastered, learning, new: newWords };
  }

  getMasteredWordsCountToDate(date) {
    let count = 0;
    this.vocabularies.forEach(v =>
      v.units.forEach(u =>
        u.words.forEach(w => {
          if (w.masteredDate && w.masteredDate <= date) count++;
        })
      )
    );
    return count;
  }

  /* ---------------- 词汇统计 ---------------- */
  renderVocabularyStats() {
    const container = document.getElementById('vocabularyStats');
    if (!this.vocabularies.length) {
      container.innerHTML = '<div class="text-center text-gray-500 py-8">暂无词库数据</div>';
      return;
    }
    const vocabStats = this.vocabularies.map(vocab => {
      const totalWords = vocab.units.reduce((t, u) => t + u.words.length, 0);
      const masteredWords = vocab.units.reduce((t, u) => t + u.words.filter(w => w.mastered).length, 0);
      const masteryRate = totalWords ? Math.round((masteredWords / totalWords) * 100) : 0;
      return { name: vocab.name, totalWords, masteredWords, masteryRate, units: vocab.units.length, importDate: vocab.importDate };
    });
    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${vocabStats.map(v => `
          <div class="bg-gray-50 rounded-lg p-4">
            <div class="flex justify-between items-start mb-3">
              <h4 class="font-semibold text-gray-800 truncate">${v.name}</h4>
              <span class="text-sm text-gray-500">${v.units}个单元</span>
            </div>
            <div class="space-y-2">
              <div class="flex justify-between"><span class="text-sm text-gray-600">总单词:</span><span class="font-semibold">${v.totalWords}</span></div>
              <div class="flex justify-between"><span class="text-sm text-gray-600">已掌握:</span><span class="font-semibold text-green-600">${v.masteredWords}</span></div>
              <div class="flex justify-between"><span class="text-sm text-gray-600">掌握率:</span><span class="font-semibold text-blue-600">${v.masteryRate}%</span></div>
            </div>
            <div class="mt-3"><div class="bg-gray-200 rounded-full h-2"><div class="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full" style="width: ${v.masteryRate}%"></div></div></div>
            <div class="text-xs text-gray-500 mt-2">导入时间: ${v.importDate}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /* ---------------- 最近活动（async 版） ---------------- */
  async renderRecentActivity() {
    const container = document.getElementById('recentActivity');
    const activities = await this.getRecentActivities(); // 必须 await
    if (!activities.length) {
      container.innerHTML = '<div class="text-center text-gray-500 py-8">暂无学习记录</div>';
      return;
    }
    container.innerHTML = activities.slice(0, 10).map(a => `
      <div class="word-list-item">
        <div class="word-info">
          <div class="word-text">${a.word}</div>
          <div class="word-stats">
            <span>${a.type === 'learn' ? '学习' : '复习'}</span>
            <span>${a.result || ''}</span>
            <span>${a.date}</span>
          </div>
        </div>
        <div class="mastery-status ${a.masteryClass}">${a.masteryText}</div>
      </div>
    `).join('');
  }

  async getRecentActivities() {
    const activities = [];
    const reviewHistory = await idb.get(idb.STORE_PROGRESS, 'reviewHistory') || []; // 必须 await
    reviewHistory.slice(-50).forEach(r => {
      activities.push({
        word: r.word,
        type: 'review',
        result: r.result === 'familiar' ? '熟悉' : '不会',
        date: new Date(r.timestamp).toLocaleDateString(),
        masteryClass: r.result === 'familiar' ? 'mastery-learning' : 'mastery-new',
        masteryText: r.result === 'familiar' ? '学习中' : '需复习',
        timestamp: r.timestamp
      });
    });
    Object.entries(this.dailyProgress).forEach(([date, count]) => {
      activities.push({
        word: `学习了 ${count} 个单词`,
        type: 'learn',
        result: '',
        date: new Date(date).toLocaleDateString(),
        masteryClass: 'mastery-mastered',
        masteryText: '已完成',
        timestamp: date
      });
    });
    return activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /* ---------------- 成就（async 版） ---------------- */
  async renderAchievements() {
    const container = document.getElementById('achievements');
    const achievements = await this.calculateAchievements(); // 必须 await
    container.innerHTML = achievements.map(a => `
      <div class="text-center">
        <div class="achievement-badge ${a.unlocked ? '' : 'achievement-locked'}">${a.icon}</div>
        <div class="font-semibold text-gray-800 mb-1">${a.title}</div>
        <div class="text-sm text-gray-600">${a.description}</div>
        ${a.unlocked
          ? '<div class="text-xs text-green-600 mt-1">已获得</div>'
          : `<div class="text-xs text-gray-500 mt-1">进度: ${a.progress}%</div>`
        }
      </div>
    `).join('');
  }

  async calculateAchievements() {
    const stats       = await this.calculateOverviewStats(); // 必须 await
    const studyStreak = this.calculateStudyStreak();         // 同步
    return [
      { title: '初学者', description: '学习10个单词', icon: '🌱', unlocked: stats.totalWords >= 10, progress: Math.min(100, (stats.totalWords / 10) * 100) },
      { title: '勤奋学习者', description: '连续学习7天', icon: '🔥', unlocked: studyStreak >= 7, progress: Math.min(100, (studyStreak / 7) * 100) },
      { title: '单词大师', description: '掌握100个单词', icon: '🏆', unlocked: stats.masteredWords >= 100, progress: Math.min(100, (stats.masteredWords / 100) * 100) },
      { title: '复习专家', description: '复习500个单词', icon: '🎯', unlocked: stats.totalReviews >= 500, progress: Math.min(100, (stats.totalReviews / 500) * 100) },
      { title: '完美主义', description: '复习准确率达到90%', icon: '💯', unlocked: stats.reviewAccuracy >= 90, progress: Math.min(100, (stats.reviewAccuracy / 90) * 100) },
      { title: '坚持不懈', description: '连续学习30天', icon: '💪', unlocked: studyStreak >= 30, progress: Math.min(100, (studyStreak / 30) * 100) },
      { title: '词汇达人', description: '学习1000个单词', icon: '📚', unlocked: stats.totalWords >= 1000, progress: Math.min(100, (stats.totalWords / 1000) * 100) },
      { title: '终极大师', description: '掌握2000个单词', icon: '👑', unlocked: stats.masteredWords >= 2000, progress: Math.min(100, (stats.masteredWords / 2000) * 100) }
    ];
  }

  updateStudyStreak() {
    document.getElementById('studyStreak').textContent = this.calculateStudyStreak();
  }

  calculateStudyStreak() {
    const dates = Object.keys(this.dailyProgress).sort();
    if (!dates.length) return 0;
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let currentDate = new Date();
    if (!this.dailyProgress[today]) currentDate.setDate(currentDate.getDate() - 1);
    while (true) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (this.dailyProgress[dateStr]) { streak++; currentDate.setDate(currentDate.getDate() - 1); }
      else break;
    }
    return streak;
  }

  /* ---------------- 时间过滤器 ---------------- */
  changeTimeFilter(filter, button) {
    this.currentTimeFilter = filter;
    document.querySelectorAll('.time-filter button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    this.renderCharts();
  }

  /* ---------------- 动画 ---------------- */
  async animatePageLoad() {
    anime({
      targets: '.stats-card',
      translateY: [50, 0],
      opacity: [0, 1],
      delay: anime.stagger(100),
      duration: 800,
      easing: 'easeOutQuart'
    });
    anime({
      targets: '.study-streak',
      scale: [0.8, 1],
      opacity: [0, 1],
      delay: 600,
      duration: 1000,
      easing: 'easeOutElastic(1, .8)'
    });
    await this.animateNumbers();   // ④ 也加 await，防止 NaN 起点
  }

  async animateNumbers() {
    const stats = await this.calculateOverviewStats();   // 必须 await
    this.animateNumber('totalWordsLearned', 0, stats.totalWords, 2000);
    this.animateNumber('masteredWordsCount', 0, stats.masteredWords, 2000);
    this.animateNumber('totalStudyTime', 0, Math.round(stats.totalStudyTime / 60), 2000);
    this.animateNumber('totalReviews', 0, stats.totalReviews, 2000);
    this.animateNumber('studyStreak', 0, this.calculateStudyStreak(), 1500);
  }

  animateNumber(elementId, start, end, duration) {
    const element = document.getElementById(elementId);
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(start + (end - start) * easeOutQuart);
      element.textContent = current;
      if (progress < 1) requestAnimationFrame(animate);
    };
    animate();
  }

  /* ---------------- 通知 ---------------- */
  showNotification(message, type = 'info') {
    const n = document.createElement('div');
    n.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-white ${
      type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
    }`;
    n.textContent = message;
    document.body.appendChild(n);
    anime({ targets: n, translateX: [300, 0], opacity: [0, 1], duration: 300, easing: 'easeOutQuart' });
    setTimeout(() => {
      anime({ targets: n, translateX: [0, 300], opacity: [1, 0], duration: 300, easing: 'easeInQuart', complete: () => n.remove() });
    }, 3000);
  }
}

/* ---------------- 页面入口 ---------------- */
let statsManager;
document.addEventListener('DOMContentLoaded', async () => {
  statsManager = new StatsManager();
  await statsManager.init();   // 统一 await

  window.addEventListener('resize', () =>
    Object.values(statsManager.charts).forEach(chart => chart?.resize())
  );
});

/* ---------------- 全局函数 ---------------- */
function changeTimeFilter(filter, button) {
  statsManager.changeTimeFilter(filter, button);
}