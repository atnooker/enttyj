// ========================= 学习模式业务类 =========================
class StudyMode {
  constructor() {
    this.currentVocabulary = null;
    this.selectedUnits = [];
    this.currentWords = [];
    this.currentWordIndex = 0;
    this.isCardExpanded = false;
    this.sessionStats = {
      totalWords: 0,
      familiar: 0,
      unfamiliar: 0,
      startTime: Date.now(),
      completedWords: 0,
      newMastered: 0
    };
    this.studySettings1 = null;   // 异步加载
  }

  async init() {
    await this.loadStudySettings1();
    await this.loadStudyData();
    this.setupEventListeners();
    this.startStudy();
  }

  /* ================  下面所有 localStorage 调用全部换成 idb ================ */
  async loadStudyData() {
    const config = await idb.get(idb.STORE_CONFIG, 'wordmaster_config') || {};
    const vocabs = await idb.get(idb.STORE_VOCABS, 'wordmaster_vocabularies') || [];

    if (!config.currentVocabulary || !config.selectedUnits?.length) {
      this.showError('请先选择词库和学习单元');
      setTimeout(() => window.location.href = 'index.html', 2000);
      return;
    }

    this.currentVocabulary = vocabs.find(v => v.id === config.currentVocabulary);
    this.selectedUnits = config.selectedUnits;

    if (!this.currentVocabulary) {
      this.showError('词库数据丢失，请重新导入');
      setTimeout(() => window.location.href = 'index.html', 2000);
      return;
    }

    this.prepareWordList();
    this.updateStudyInfo();
  }

  async saveProgress() {
    const vocabs = await idb.get(idb.STORE_VOCABS, 'wordmaster_vocabularies') || [];
    const idx = vocabs.findIndex(v => v.id === this.currentVocabulary.id);
    if (idx !== -1) {
      vocabs[idx] = this.currentVocabulary;
      await idb.set(idb.STORE_VOCABS, 'wordmaster_vocabularies', vocabs);
    }
  }

  async savedailyProgress1(wordsLearned) {
    const today = new Date().toISOString().split('T')[0];
    const prog = await idb.get(idb.STORE_PROGRESS, 'dailyProgress1') || {};
    prog[today] = (prog[today] || 0) + wordsLearned;
    await idb.set(idb.STORE_PROGRESS, 'dailyProgress1', prog);
  }

  async loadStudySettings1() {
    this.studySettings1 = await idb.get(idb.STORE_CONFIG, 'studySettings1') || {
      mode: 'random',
      autoPlay: true,
      autoChinese: false,
      highlightVowels: false
    };
  }

  async saveStudySettings1() {
    await idb.set(idb.STORE_CONFIG, 'studySettings1', this.studySettings1);
  }

  /* ================  其余业务代码完全不变 ================ */
  adjustFontSize() {
    const el = document.getElementById('wordDisplay');
    if (!el) return;
    // 含空格 -> 句子；否则 -> 单词
    const isSentence = /\s/.test(el.textContent.trim());
    el
      .style.fontSize = isSentence ? '4rem' : '6rem';
  }
  prepareWordList() {
    this.currentWords = [];
    this.selectedUnits.forEach(unitNum => {
      const unit = this.currentVocabulary.units.find(u => u.unitNumber === unitNum);
      if (unit?.words) this.currentWords.push(...unit.words);
    });
    this.sortWordsByMode();
    if (this.studySettings1.mode === 'random') this.shuffleArray(this.currentWords);
    this.sessionStats.totalWords = this.currentWords.length;
  }

  sortWordsByMode() {
    switch (this.studySettings1.mode) {
      case 'priority':
        this.currentWords.sort((a, b) => (b.unfamiliar || 0) - (a.unfamiliar || 0));
        break;
      case 'sequential': break;
      default: break;
    }
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  startStudy() {
    if (!this.currentWords.length) {
      this.showError('没有可学习的单词');
      return;
    }
    this.currentWordIndex = 0;
    this.sessionStats.startTime = Date.now();
    this.sessionStats.completedWords = 0;
    this.sessionStats.newMastered = 0;
    this.showCurrentWord();
    this.updateProgress();
    this.updateSessionStats();
    document.getElementById('studyCard').style.display = 'block';
    document.getElementById('actionButtons').style.display = 'flex';
    this.animateCardEntrance();
  }

  showCurrentWord() {
    if (this.currentWordIndex >= this.currentWords.length) {
      this.completeStudy();
      return;
    }
    const word = this.currentWords[this.currentWordIndex];
    document.getElementById('wordDisplay').textContent = word.word || 'Unknown';
    document.getElementById('phoneticDisplay').textContent = word.phonetic || '';
    document.getElementById('meaningDisplay').textContent = word.chinese || '';
    document.getElementById('exampleDisplay').textContent = word.example || '';
      this.updateMasteryIndicator(word);
    this.isCardExpanded = false;
    document.getElementById('studyCard').classList.remove('expanded');
    if (this.studySettings1.autoPlay) setTimeout(() => this.playAudio(), 200);
    this.animateWordChange();
    if (this.studySettings1.highlightVowels) this.highlightVowels();
    if (this.studySettings1.autoChinese) document.getElementById('studyCard').classList.add('expanded');
    this.adjustFontSize();
      const exampleEl = document.getElementById('exampleDisplay');
  exampleEl.textContent = word.example || '';

  // 空例句不占位
  exampleEl.style.display = (!word.example || !word.example.trim()) ? 'none' : 'block';
  }

  updateMasteryIndicator(word) {
    const ind = document.getElementById('masteryIndicator');
    ind.className = 'mastery-indicator';
    if (word.mastered) ind.classList.add('mastered');
    else if ((word.familiar || 0) >= 3) ind.classList.add('learning');
    else ind.classList.add('new');
  }

  toggleCard() {
    const card = document.getElementById('studyCard');
    this.isCardExpanded = !this.isCardExpanded;
    card.classList.toggle('expanded', this.isCardExpanded);
    anime({ targets: card, scale: [1, 1.02, 1], duration: 200, easing: 'easeOutQuart' });
  }

  async markFamiliar() {
    const word = this.currentWords[this.currentWordIndex];
    word.familiar = (word.familiar || 0) + 1;
    if (word.familiar >= 5 && !word.mastered) {
      word.mastered = true;
      this.sessionStats.newMastered++;
      this.showMasteredAnimation();
    }
    this.sessionStats.familiar++;
    this.sessionStats.completedWords++;
    this.toggleCard();
    await this.saveProgress();
    this.updateSessionStats();
    this.updateProgress();
    setTimeout(() => this.nextWord(), 3000);
  }

  async markUnfamiliar() {
    const word = this.currentWords[this.currentWordIndex];
    word.unfamiliar = (word.unfamiliar || 0) + 1;
    if (word.unfamiliar >= 3 && word.mastered) word.mastered = false;
    this.sessionStats.unfamiliar++;
    this.sessionStats.completedWords++;
    this.toggleCard();
    await this.saveProgress();
    this.updateSessionStats();
    this.updateProgress();
    setTimeout(() => this.nextWord(), 3000);
  }

  // 其余所有方法保持原样，仅把“保存”换成异步即可
  nextWord() {
    this.currentWordIndex++;
    this.updateProgress();
    if (this.currentWordIndex >= this.currentWords.length) {
      setTimeout(() => this.completeStudy(), 3000);
    } else {
      this.showCurrentWord();
    }
  }

  previousWord() {
    if (this.currentWordIndex > 0) {
      this.currentWordIndex--;
      this.showCurrentWord();
      this.updateProgress();
    }
  }

  completeStudy() {
    document.getElementById('studyCard').style.display = 'none';
    document.getElementById('actionButtons').style.display = 'none';
    document.getElementById('studyComplete').classList.remove('hidden');
    const min = Math.round((Date.now() - this.sessionStats.startTime) / 60000);
    const acc = this.sessionStats.completedWords ? Math.round((this.sessionStats.familiar / this.sessionStats.completedWords) * 100) : 0;
    document.getElementById('completedWords').textContent = this.sessionStats.completedWords;
    document.getElementById('masteredCount').textContent = this.sessionStats.newMastered;
    document.getElementById('studyTime').textContent = min;
    document.getElementById('accuracy').textContent = acc + '%';
    this.savedailyProgress1(this.sessionStats.completedWords);
    this.animateStudyComplete();
    this.showNotification('学习完成！恭喜您完成了本次学习计划', 'success');
  }

  playAudio() {
    const word = this.currentWords[this.currentWordIndex];
    if (!word?.word) return;
    if (!('speechSynthesis' in window)) {
      this.showNotification('您的浏览器不支持语音功能', 'error');
      return;
    }

    // 1. 清掉之前没说完的
    speechSynthesis.cancel();
    // 2. 如果浏览器把语音挂起了，先恢复
    if (speechSynthesis.paused) speechSynthesis.resume();

    const utter = new SpeechSynthesisUtterance(word.word);
    utter.lang = 'en-US';
    utter.rate = 0.8;
    utter.pitch = 1;

    speechSynthesis.speak(utter);

    const btn = document.getElementById('audioBtn');
    if (btn) anime({ targets: btn, scale: [1, 0.95, 1], duration: 200 });
  }

  updateProgress() {
    const prog = (this.currentWordIndex / this.currentWords.length) * 100;
    document.getElementById('studyProgress').style.width = prog + '%';
    document.getElementById('currentProgress').textContent = this.sessionStats.completedWords;
    document.getElementById('totalProgress').textContent = this.currentWords.length;
    const rem = Math.ceil((this.currentWords.length - this.currentWordIndex) * 30 / 60);
    document.getElementById('remainingTime').textContent = rem + '分钟';
  }

  updateSessionStats() {
    document.getElementById('sessionWords').textContent = this.sessionStats.completedWords;
    document.getElementById('sessionFamiliar').textContent = this.sessionStats.familiar;
    document.getElementById('sessionUnfamiliar').textContent = this.sessionStats.unfamiliar;
  }

  updateStudyInfo() {
    const name = this.currentVocabulary.name;
    const units = this.selectedUnits.map(n => {
      const u = this.currentVocabulary.units.find(u => u.unitNumber === n);
      return u ? u.unitName : `Unit ${n}`;
    }).join(', ');
    document.getElementById('studyInfo').textContent = `${name} - ${units}（${this.currentWords.length}个单词）`;
  }

  // 动画 & 工具
  animateCardEntrance() {
    anime({ targets: '#studyCard', scale: [0.8, 1], opacity: [0, 1], duration: 800, easing: 'easeOutElastic(1, .8)' });
    anime({ targets: '#actionButtons', translateY: [50, 0], opacity: [0, 1], delay: 300, duration: 600, easing: 'easeOutQuart' });
  }

  animateWordChange() {
    const card = document.getElementById('studyCard');
    anime({ targets: card, scale: [1, 0.95, 1], duration: 300, easing: 'easeOutQuart' });
    anime({ targets: '#wordDisplay', scale: [0.8, 1], opacity: [0, 1], delay: 100, duration: 600, easing: 'easeOutElastic(1, .8)' });
    anime({ targets: '#phoneticDisplay', scale: [0.8, 1], opacity: [0, 1], delay: 200, duration: 600, easing: 'easeOutElastic(1, .8)' });
  }

  showMasteredAnimation() {
    const ind = document.getElementById('masteryIndicator');
    anime({ targets: ind, scale: [1, 1.5, 1], duration: 1000, easing: 'easeOutElastic(1, .8)' });
    const celeb = document.createElement('div');
    celeb.innerHTML = '🎉'; celeb.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-6xl z-50 pointer-events-none';
    document.body.appendChild(celeb);
    anime({ targets: celeb, scale: [0, 1.2, 0], rotate: [0, 360], opacity: [0, 1, 0], duration: 2000, easing: 'easeOutElastic(1, .8)', complete: () => celeb.remove() });
  }

  animateStudyComplete() {
    anime({ targets: '#studyComplete', scale: [0.8, 1], opacity: [0, 1], duration: 1000, easing: 'easeOutElastic(1, .8)' });
  }

  setupEventListeners() {
    document.getElementById('studyMode').addEventListener('change', async e => {
      this.studySettings1.mode = e.target.value;
      await this.saveStudySettings1();
      this.prepareWordList();
    });
    document.getElementById('autoPlay').addEventListener('change', async e => {
      this.studySettings1.autoPlay = e.target.value === 'on';
      await this.saveStudySettings1();
    });
    document.getElementById('autoChinese').addEventListener('change', async e => {
      this.studySettings1.autoChinese = e.target.value === 'on';
      await this.saveStudySettings1();
    });
    document.getElementById('highlightVowels').addEventListener('change', async e => {
      this.studySettings1.highlightVowels = e.target.value === 'on';
      await this.saveStudySettings1();
    });
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      switch (e.key) {
        case ' ':
          e.preventDefault(); this.toggleCard(); break;
        case 'ArrowLeft':
          e.preventDefault(); this.previousWord(); break;
        case 'ArrowRight': case 'Enter':
          e.preventDefault(); this.nextWord(); break;
        case 'f': case 'F':
          e.preventDefault(); this.markFamiliar(); break;
        case 'u': case 'U':
          e.preventDefault(); this.markUnfamiliar(); break;
        case 'p': case 'P':
          e.preventDefault(); this.playAudio(); break;
      }
    });
    const unlockAudio = () => {
      const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      audio.play().catch(() => { });
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
  }

  showNotification(msg, type = 'info') {
    const n = document.createElement('div');
    n.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-white ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`;
    n.textContent = msg;
    document.body.appendChild(n);
    anime({ targets: n, translateX: [300, 0], opacity: [0, 1], duration: 300, easing: 'easeOutQuart' });
    setTimeout(() => anime({ targets: n, translateX: [0, 300], opacity: [1, 0], duration: 300, easing: 'easeInQuart', complete: () => n.remove() }), 3000);
  }

  showError(msg) { this.showNotification(msg, 'error'); }

  /* =============  1. 极简元音高亮  ============= */
  highlightVowels() {
    const node = document.getElementById('wordDisplay');
    if (!node.textContent) return;
    // 一次性替换：元音→<span class="vowel">元音</span>
    node.innerHTML = node.textContent.replace(/[aeiouAEIOU]/g, '<span class="vowel">$&</span>');
  }

}

// ========================= 全局函数 =========================
const toggleCard = () => studyMode.toggleCard();
const markFamiliar = () => studyMode.markFamiliar();
const markUnfamiliar = () => studyMode.markUnfamiliar();
const playAudio = () => studyMode.playAudio();
const autoChinese = () => studyMode.autoChinese();
const highlightVowels = () => studyMode.highlightVowelsAndAnimateSyllables();
const exitStudy = () => { if (confirm('确定要退出当前学习吗？进度已保存。')) window.location.href = 'index.html'; };
const startNewStudy = () => window.location.reload();
const goToReview = () => window.location.href = 'review.html';
const goToStats = () => window.location.href = 'stats.html';

// ========================= 初始化 =========================
let studyMode;
document.addEventListener('DOMContentLoaded', async () => {
  studyMode = new StudyMode();
  await studyMode.init();          // 现在全是异步
  // 设置 UI 初始值
  document.getElementById('studyMode').value = studyMode.studySettings1.mode;
  document.getElementById('autoPlay').value = studyMode.studySettings1.autoPlay ? 'on' : 'off';
  document.getElementById('autoChinese').value = studyMode.studySettings1.autoChinese ? 'on' : 'off';
  document.getElementById('highlightVowels').value = studyMode.studySettings1.highlightVowels ? 'on' : 'off';
});