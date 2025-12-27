/************************************************************
 *  复习管理器（ReviewMode 完整版）
 ***********************************************************/
class ReviewMode {
  constructor() {
    this.vocabularies = [];
    this.currentReviewMode = 'difficult';
    this.reviewWords = [];
    this.currentWordIndex = 0;
    this.isCardExpanded = false;
    this.reviewStats = {
      totalReviewed: 0,
      familiar: 0,
      difficult: 0,
      newMastered: 0,
      startTime: 0
    };
  }

  async init() {
    await this.loadVocabularies();
    this.updateReviewStats();
    this.renderWordListPreview();
    this.setupEventListeners();
  }

  /* ---------------- 数据层：IndexedDB ---------------- */
  async loadVocabularies() {
    this.vocabularies = (await idb.get(idb.STORE_VOCABS, 'wordmaster_vocabularies')) || [];
  }

  async saveVocabularies() {
    await idb.set(idb.STORE_VOCABS, 'wordmaster_vocabularies', this.vocabularies);
  }

  async getReviewHistory() {
    return (await idb.get(idb.STORE_PROGRESS, 'reviewHistory')) || [];
  }

  async saveReviewHistory(history) {
    await idb.set(idb.STORE_PROGRESS, 'reviewHistory', history);
  }

  async getReviewSessions() {
    return (await idb.get(idb.STORE_PROGRESS, 'reviewSessions')) || [];
  }

  async saveReviewSessions(sessions) {
    await idb.set(idb.STORE_PROGRESS, 'reviewSessions', sessions);
  }

  /* ---------------- 业务逻辑（完全保留） ---------------- */
  updateReviewStats() {
    const stats = this.calculateReviewStats();
    document.getElementById('totalReviewWords').textContent = stats.totalReview;
    document.getElementById('difficultWords').textContent = stats.difficultWords;
    document.getElementById('forgottenWords').textContent = stats.forgottenWords;
    document.getElementById('masteredToday').textContent = stats.masteredToday;
    document.getElementById('reviewAccuracy').textContent = stats.accuracy + '%';
  }

  calculateReviewStats() {
    let difficultWords = 0, forgottenWords = 0, masteredToday = 0, totalReview = 0;
    const today = new Date().toISOString().split('T')[0];

    this.vocabularies.forEach(vocab => {
      vocab.units.forEach(unit => {
        unit.words.forEach(word => {
          if ((word.unfamiliar || 0) >= 2) difficultWords++;
          const lastReview = word.lastReview || vocab.importDate;
          const daysSinceReview = Math.floor((new Date() - new Date(lastReview)) / (1000 * 60 * 60 * 24));
          if (daysSinceReview > 7 && !word.mastered) forgottenWords++;
          if (word.masteredDate === today) masteredToday++;
        });
      });
    });

    switch (this.currentReviewMode) {
      case 'difficult': totalReview = difficultWords; break;
      case 'forgotten': totalReview = forgottenWords; break;
      case 'random': totalReview = Math.min(50, this.getAllWordsCount()); break;
    }

    const reviewHistory = (async () => await this.getReviewHistory())() || [];
    const accuracy = reviewHistory.length
      ? Math.round((reviewHistory.filter(r => r.result === 'familiar').length / reviewHistory.length) * 100)
      : 0;

    return { totalReview, difficultWords, forgottenWords, masteredToday, accuracy };
  }

  getAllWordsCount() {
    return this.vocabularies.reduce((total, vocab) =>
      total + vocab.units.reduce((unitTotal, unit) => unitTotal + unit.words.length, 0), 0
    );
  }

  renderWordListPreview() {
    const container = document.getElementById('wordListPreview');
    const emptyState = document.getElementById('emptyReviewState');
    const words = this.getReviewWords();

    if (!words.length) {
      container.classList.add('hidden');
      emptyState.classList.remove('hidden');
      document.getElementById('startReviewBtn').disabled = true;
      return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');
    document.getElementById('startReviewBtn').disabled = false;

    const previewWords = words.slice(0, 12);
    container.innerHTML = previewWords.map(word => {
      const difficulty = this.getWordDifficulty(word);
      const difficultyClass = `difficulty-${difficulty}`;
      return `
        <div class="review-card p-4 relative">
          <div class="difficulty-badge ${difficultyClass}">${difficulty === 'easy' ? '简单' : difficulty === 'medium' ? '中等' : '困难'}</div>
          <div class="word-preview">${word.word}</div>
          <div class="phonetic-preview">${word.phonetic}</div>
          <div class="stats-preview">
            <div class="stat-item"><div class="stat-value">${word.familiar || 0}</div><div class="stat-label">熟悉</div></div>
            <div class="stat-item"><div class="stat-value">${word.unfamiliar || 0}</div><div class="stat-label">不会</div></div>
            <div class="stat-item"><div class="stat-value">${word.mastered ? '✅' : '⭕'}</div><div class="stat-label">状态</div></div>
          </div>
        </div>
      `;
    }).join('');

    anime({
      targets: '.review-card',
      scale: [0.9, 1],
      opacity: [0, 1],
      delay: anime.stagger(100),
      duration: 600,
      easing: 'easeOutQuart'
    });
  }

  getReviewWords() {
    let words = [];
    this.vocabularies.forEach(vocab => {
      vocab.units.forEach(unit => {
        unit.words.forEach(word => {
          let shouldInclude = false;
          switch (this.currentReviewMode) {
            case 'difficult':
              shouldInclude = (word.unfamiliar || 0) >= 2;
              break;
            case 'forgotten': {
              const lastReview = word.lastReview || vocab.importDate;
              const daysSinceReview = Math.floor((new Date() - new Date(lastReview)) / (1000 * 60 * 60 * 24));
              shouldInclude = daysSinceReview > 7 && !word.mastered;
              break;
            }
            case 'random':
              shouldInclude = !word.mastered;
              break;
          }
          if (shouldInclude) words.push({ ...word, vocabularyId: vocab.id, unitNumber: unit.unitNumber });
        });
      });
    });

    // 按难度降序
    words.sort((a, b) => this.getWordDifficultyLevel(b) - this.getWordDifficultyLevel(a));
    if (this.currentReviewMode === 'random') words = this.shuffleArray(words).slice(0, Math.min(50, words.length));
    return words;
  }

  getWordDifficulty(word) {
    const unfamiliar = word.unfamiliar || 0;
    const familiar = word.familiar || 0;
    if (unfamiliar >= 3) return 'hard';
    if (unfamiliar >= 1 || familiar < 3) return 'medium';
    return 'easy';
  }

  getWordDifficultyLevel(word) {
    const difficulty = this.getWordDifficulty(word);
    return difficulty === 'hard' ? 3 : difficulty === 'medium' ? 2 : 1;
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  selectReviewMode(mode) {
    this.currentReviewMode = mode;
    document.querySelectorAll('.mode-option').forEach(option => option.classList.remove('selected'));
    document.querySelector(`[data-mode="${mode}"]`).classList.add('selected');
    this.updateReviewStats();
    this.renderWordListPreview();
  }

  async startReview() {
    this.reviewWords = this.getReviewWords();
    if (!this.reviewWords.length) {
      this.showNotification('没有需要复习的单词', 'info');
      return;
    }

    this.currentWordIndex = 0;
    this.reviewStats = { totalReviewed: 0, familiar: 0, difficult: 0, newMastered: 0, startTime: Date.now() };

    document.getElementById('reviewModal').classList.remove('hidden');
    const modeTitles = { difficult: '难点复习', forgotten: '遗忘复习', random: '随机复习' };
    document.getElementById('reviewTitle').textContent = modeTitles[this.currentReviewMode];

    this.showCurrentReviewWord();
    this.updateReviewProgress();
  }

  showCurrentReviewWord() {
    if (this.currentWordIndex >= this.reviewWords.length) {
      this.completeReview();
      return;
    }
    const word = this.reviewWords[this.currentWordIndex];
    document.getElementById('reviewWordDisplay').textContent = word.word || 'Unknown';
    document.getElementById('reviewPhoneticDisplay').textContent = word.phonetic || '';
    document.getElementById('reviewMeaningDisplay').textContent = word.chinese || '';
    document.getElementById('reviewExampleDisplay').textContent = word.example || '';

    this.isCardExpanded = false;
    document.getElementById('reviewWordCard').classList.remove('expanded');
    this.updateReviewProgress();
    this.animateReviewCardEntrance();
  }

  toggleReviewCard() {
    const card = document.getElementById('reviewWordCard');
    this.isCardExpanded = !this.isCardExpanded;
    card.classList.toggle('expanded', this.isCardExpanded);
    anime({ targets: card, scale: [1, 1.02, 1], duration: 200, easing: 'easeOutQuart' });
  }

  async markReviewFamiliar() {
    const word = this.reviewWords[this.currentWordIndex];
    word.familiar = (word.familiar || 0) + 1;
    if (word.familiar >= 5 && !word.mastered) {
      word.mastered = true;
      word.masteredDate = new Date().toISOString().split('T')[0];
      this.reviewStats.newMastered++;
      this.showMasteredAnimation();
    }
    word.lastReview = new Date().toISOString();
    this.reviewStats.familiar++;
    this.reviewStats.totalReviewed++;
    await this.saveReviewProgress(word, 'familiar');
    this.nextReviewWord();
  }

  async markReviewDifficult() {
    const word = this.reviewWords[this.currentWordIndex];
    word.unfamiliar = (word.unfamiliar || 0) + 1;
    if (word.unfamiliar >= 3 && word.mastered) {
      word.mastered = false;
      word.masteredDate = null;
    }
    word.lastReview = new Date().toISOString();
    this.reviewStats.difficult++;
    this.reviewStats.totalReviewed++;
    await this.saveReviewProgress(word, 'difficult');
    this.nextReviewWord();
  }

  playReviewAudio() {
    const word = this.reviewWords[this.currentWordIndex];
    if (!word?.word) return;
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(word.word);
      utter.lang = 'en-US'; utter.rate = 0.8; utter.pitch = 1;
      speechSynthesis.speak(utter);
      const btn = document.getElementById('audioBtn');
      anime({ targets: btn, scale: [1, 0.95, 1], duration: 200 });
    } else this.showNotification('您的浏览器不支持语音功能', 'error');
  }

  nextReviewWord() {
    this.currentWordIndex++;
    if (this.currentWordIndex >= this.reviewWords.length) this.completeReview();
    else this.showCurrentReviewWord();
  }

  async completeReview() {
    document.getElementById('reviewModal').classList.add('hidden');
    document.getElementById('reviewCompleteModal').classList.remove('hidden');
    document.getElementById('reviewedCount').textContent = this.reviewStats.totalReviewed;
    document.getElementById('masteredInReview').textContent = this.reviewStats.newMastered;

    await this.saveReviewHistory();
    this.updateReviewStats();
    this.renderWordListPreview();
    this.animateReviewComplete();
    this.showNotification('复习完成！继续保持良好的学习习惯', 'success');
  }

  updateReviewProgress() {
    const progress = (this.currentWordIndex / this.reviewWords.length) * 100;
    document.getElementById('reviewProgress').style.width = progress + '%';
    document.getElementById('currentReviewProgress').textContent = this.currentWordIndex;
    document.getElementById('totalReviewProgress').textContent = this.reviewWords.length;
    const remainingWords = this.reviewWords.length - this.currentWordIndex;
    const remainingMinutes = Math.ceil(remainingWords * 45 / 60);
    document.getElementById('remainingReviewTime').textContent = remainingMinutes + '分钟';
  }

  async saveReviewProgress(word, result) {
    // 写回主词库
    const vocabularies = (await idb.get(idb.STORE_VOCABS, 'wordmaster_vocabularies')) || [];
    const vocabIndex = vocabularies.findIndex(v => v.id === word.vocabularyId);
    if (vocabIndex !== -1) {
      const unitIndex = vocabularies[vocabIndex].units.findIndex(u => u.unitNumber === word.unitNumber);
      if (unitIndex !== -1) {
        const wordIndex = vocabularies[vocabIndex].units[unitIndex].words.findIndex(w => w.id === word.id);
        if (wordIndex !== -1) vocabularies[vocabIndex].units[unitIndex].words[wordIndex] = word;
      }
    }
    await idb.set(idb.STORE_VOCABS, 'wordmaster_vocabularies', vocabularies);

    // 写复习历史
    const history = await this.getReviewHistory();
    history.push({ wordId: word.id, word: word.word, result, timestamp: new Date().toISOString(), mode: this.currentReviewMode });
    if (history.length > 1000) history.splice(0, history.length - 1000);
    await this.saveReviewHistory(history);
  }

  async saveReviewHistory(history) {
    await idb.set(idb.STORE_PROGRESS, 'reviewHistory', history);
  }

  async saveReviewHistory() {
    const today = new Date().toISOString().split('T')[0];
    const sessions = await this.getReviewSessions();
    sessions.push({
      date: today,
      mode: this.currentReviewMode,
      totalWords: this.reviewStats.totalReviewed,
      familiar: this.reviewStats.familiar,
      difficult: this.reviewStats.difficult,
      newMastered: this.reviewStats.newMastered,
      duration: Math.round((Date.now() - this.reviewStats.startTime) / 60000)
    });
    // 只留最近 30 天
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const filtered = sessions.filter(s => new Date(s.date) >= thirtyDaysAgo);
    await this.saveReviewSessions(filtered);
  }

  /* ---------------- 动画 & 事件 ---------------- */
  animateReviewCardEntrance() {
    const card = document.getElementById('reviewWordCard');
    anime({ targets: card, scale: [0.8, 1], opacity: [0, 1], duration: 800, easing: 'easeOutElastic(1, .8)' });
    anime({ targets: '#reviewWordDisplay', scale: [0.8, 1], opacity: [0, 1], duration: 600, delay: 100, easing: 'easeOutElastic(1, .8)' });
    anime({ targets: '#reviewPhoneticDisplay', scale: [0.8, 1], opacity: [0, 1], duration: 600, delay: 200, easing: 'easeOutElastic(1, .8)' });
  }

  showMasteredAnimation() {
    const celeb = document.createElement('div');
    celeb.innerHTML = '🎉'; celeb.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-6xl z-50 pointer-events-none';
    document.body.appendChild(celeb);
    anime({ targets: celeb, scale: [0, 1.2, 0], rotate: [0, 360], opacity: [0, 1, 0], duration: 2000, easing: 'easeOutElastic(1, .8)', complete: () => celeb.remove() });
  }

  animateReviewComplete() {
    anime({ targets: '#reviewCompleteModal .bg-white', scale: [0.8, 1], opacity: [0, 1], duration: 1000, easing: 'easeOutElastic(1, .8)' });
  }

  setupEventListeners() {
    document.addEventListener('keydown', e => {
      if (document.getElementById('reviewModal').classList.contains('hidden')) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      switch (e.key) {
        case ' ':
          e.preventDefault(); this.toggleReviewCard(); break;
        case 'Enter':
          e.preventDefault(); this.markReviewFamiliar(); break;
        case 'd': case 'D':
          e.preventDefault(); this.markReviewDifficult(); break;
        case 'p': case 'P':
          e.preventDefault(); this.playReviewAudio(); break;
        case 'Escape':
          e.preventDefault(); if (confirm('确定要退出当前复习吗？进度已保存。')) document.getElementById('reviewModal').classList.add('hidden'); break;
      }
    });
  }

  showNotification(message, type = 'info') {
    const n = document.createElement('div');
    n.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-white ${
      type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
    }`;
    n.textContent = message;
    document.body.appendChild(n);
    anime({ targets: n, translateX: [300, 0], opacity: [0, 1], duration: 300, easing: 'easeOutQuart' });
    setTimeout(() => anime({ targets: n, translateX: [0, 300], opacity: [1, 0], duration: 300, easing: 'easeInQuart', complete: () => n.remove() }), 3000);
  }
}

/* ************************************************************
 *  页面入口 & 全局函数
 ************************************************************ */
let reviewMode;
document.addEventListener('DOMContentLoaded', async () => {
  reviewMode = new ReviewMode();
  await reviewMode.init();
});

/* 供 HTML 调用的全局函数 */
function selectReviewMode(mode) { reviewMode.selectReviewMode(mode); }
function startReview() { reviewMode.startReview(); }
function toggleReviewCard() { reviewMode.toggleReviewCard(); }
function markReviewFamiliar() { reviewMode.markReviewFamiliar(); }
function markReviewDifficult() { reviewMode.markReviewDifficult(); }
function playReviewAudio() { reviewMode.playReviewAudio(); }
function exitReview() {
  if (confirm('确定要退出当前复习吗？进度已保存。')) document.getElementById('reviewModal').classList.add('hidden');
}
function startNewReview() {
  document.getElementById('reviewCompleteModal').classList.add('hidden');
  reviewMode.startReview();
}
function goToStudy() {
  window.location.href = 'study.html';
}