// ========================= 业务类 =========================
class WordMasterApp {
  constructor() {
    this.vocabularies = [];
    this.currentVocabulary = null;
    this.selectedUnits = [];
    this.selectedFile = null;
    this.config = null; // 异步加载
    this._keys = {
      vocabs: 'wordmaster_vocabularies',
      config: 'wordmaster_config',
      progress: 'dailyProgress'
    };
  }

  async init() {
    await this.loadVocabularies();
    this.config = await this.loadConfig();
    this.updateStats();
    this.setupEventListeners();
    this.renderVocabularyList();
    anime({
      targets: '.stats-card',
      translateY: [50, 0],
      opacity: [0, 1],
      delay: anime.stagger(100),
      duration: 800,
      easing: 'easeOutQuart'
    });
  }

  /* ================  以下为原业务代码，仅把 localStorage 换成 idb ================ */
  setupEventListeners() {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    fileInput.addEventListener('change', e => this.handleFileSelect(e.target.files[0]));
    ['dragover', 'dragleave', 'drop'].forEach(type => {
      dropZone.addEventListener(type, e => {
        e.preventDefault();
        if (type === 'dragover') dropZone.classList.add('border-blue-500', 'bg-blue-50');
        else dropZone.classList.remove('border-blue-500', 'bg-blue-50');
        if (type === 'drop' && e.dataTransfer.files[0]) this.handleFileSelect(e.dataTransfer.files[0]);
      });
    });
  }

  handleFileSelect(file) {
    if (!file) return;
    const valid = ['.xlsx', '.xls'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!valid.includes(ext)) return this.showNotification('请选择有效的Excel文件 (.xlsx, .xls)', 'error');
    this.selectedFile = file;
    const dropZone = document.getElementById('dropZone');
    dropZone.innerHTML = `
      <div class="text-4xl mb-4">✅</div>
      <div class="text-lg font-medium text-green-600 mb-2">已选择文件</div>
      <div class="text-sm text-gray-600 mb-4">${file.name}</div>
      <button onclick="document.getElementById('fileInput').click()" class="btn-primary">重新选择</button>`;
    document.getElementById('importBtn').disabled = false;
    this.showNotification('文件选择成功，点击导入按钮开始处理', 'success');
  }

  async importVocabulary() {
    if (!this.selectedFile) return this.showNotification('请先选择文件', 'error');
    try {
      this.showLoading('正在解析词库文件...');
      const data = await this.selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (raw.length < 2) throw new Error('词库文件格式不正确，至少需要包含标题行和数据行');
      const vocab = this.parseVocabularyData(raw);
      vocab.fileName = this.selectedFile.name;
      vocab.importDate = new Date().toISOString().split('T')[0];
      const idx = this.vocabularies.findIndex(v => v.name === vocab.name);
      idx === -1 ? this.vocabularies.push(vocab) : (this.vocabularies[idx] = vocab);
      await this.saveVocabularies();
      this.renderVocabularyList();
      this.updateStats();
      this.hideImportModal();
      this.hideLoading();
      this.addSuccessAnimation();
      this.showNotification(idx === -1 ? '词库导入成功' : '词库已更新', 'success');
    } catch (e) {
      this.hideLoading();
      this.showNotification('词库导入失败: ' + e.message, 'error');
    }
  }

  parseVocabularyData(raw) {
    const headers = raw[0], rows = raw.slice(1);
    const need = ['单元', '单词', '音标', '中文解释', '例句'];
    const map = {};
    need.forEach(n => {
      const i = headers.findIndex(h => h && h.toString().includes(n));
      if (i === -1) throw new Error(`词库缺少必需的列: ${n}`);
      map[n] = i;
    });
    const vocab = { id: 'vocab_' + Date.now(), name: this.extractVocabName(headers, rows), units: new Map() };
    rows.forEach((row, idx) => {
      if (!row || !row.length) return;
      try {
        const unitNum = parseInt(row[map['单元']]?.toString() || '1') || 1;
        const unitName = `Unit ${unitNum}`;
        if (!vocab.units.has(unitName)) vocab.units.set(unitName, { unitNumber: unitNum, unitName, words: [] });
        const word = {
          id: 'word_' + Date.now() + '_' + idx,
          word: row[map['单词']]?.toString().trim() || '',
          phonetic: row[map['音标']]?.toString().trim() || '',
          chinese: row[map['中文解释']]?.toString().trim() || '',
          example: row[map['例句']]?.toString().trim() || '',
          familiar: this.parseStat(row, headers, '熟悉'),
          unfamiliar: this.parseStat(row, headers, '不会'),
          mastered: this.parseMaster(row, headers)
        };
        if (word.word) vocab.units.get(unitName).words.push(word);
      } catch (e) { console.warn('行处理失败', e, row); }
    });
    vocab.units = Array.from(vocab.units.values());
    if (!vocab.units.length || vocab.units.every(u => !u.words.length)) throw new Error('词库中没有有效单词');
    return vocab;
  }

  extractVocabName() { return this.selectedFile.name.replace(/\.[^/.]+$/, "") || '未命名词库'; }
  parseStat(row, headers, name) {
    const i = headers.findIndex(h => h && h.toString().includes(name));
    if (i === -1) return 0;
    const v = parseInt(row[i]);
    return isNaN(v) ? 0 : Math.max(0, v);
  }
  parseMaster(row, headers) {
    const i = headers.findIndex(h => h && h.toString().includes('掌握'));
    if (i === -1) return false;
    const v = row[i]?.toString().toLowerCase();
    return v === 'ok' || v === 'yes' || v === 'true' || v === '1';
  }

  renderVocabularyList() {
    const box = document.getElementById('vocabularyList'), empty = document.getElementById('emptyState');
    if (!this.vocabularies.length) { box.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    box.innerHTML = this.vocabularies.map(v => `
      <div class="vocabulary-item p-6 card-hover" onclick="app.showVocabularyDetail('${v.id}')">
        <div class="flex justify-between items-start mb-4">
          <h3 class="text-xl font-semibold text-gray-800 truncate">${v.name}</h3>
          <span class="text-sm text-gray-500">${v.importDate}</span>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div class="text-center"><div class="text-2xl font-bold text-blue-600">${this.getTotalWords(v)}</div><div class="text-sm text-gray-600">总单词</div></div>
          <div class="text-center"><div class="text-2xl font-bold text-green-600">${this.getMasteredWords(v)}</div><div class="text-sm text-gray-600">已掌握</div></div>
        </div>
        <div class="flex flex-wrap gap-1 mb-4">
          ${v.units.slice(0, 3).map(u => `<span class="unit-tag">${u.unitName}</span>`).join('')}
          ${v.units.length > 3 ? `<span class="unit-tag">+${v.units.length - 3}</span>` : ''}
        </div>
        <div class="flex space-x-2">
          <button onclick="event.stopPropagation(); app.showVocabularyDetail('${v.id}')" class="flex-1 btn-primary text-sm py-2">管理</button>
          <button onclick="event.stopPropagation(); app.deleteVocabulary('${v.id}')" class="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm">删除</button>
        </div>
      </div>`).join('');
    anime({ targets: '.vocabulary-item', scale: [0.9, 1], opacity: [0, 1], delay: anime.stagger(100), duration: 600, easing: 'easeOutQuart' });
  }

  showVocabularyDetail(id) {
    this.currentVocabulary = this.vocabularies.find(v => v.id === id);
    if (!this.currentVocabulary) return;
    document.getElementById('vocabularyTitle').textContent = this.currentVocabulary.name;
    this.renderUnitTags();
    this.updateVocabularyModalStats();
    document.getElementById('vocabularyModal').classList.remove('hidden');
    this.selectedUnits = [];
    this.updateUnitSelection();
  }

  renderUnitTags() {
    const box = document.getElementById('unitTags');
    box.innerHTML = this.currentVocabulary.units.map(u => `
      <span class="unit-tag" onclick="app.toggleUnit('${u.unitNumber}')" data-unit="${u.unitNumber}">${u.unitName} (${u.words.length}词)</span>`).join('');
  }

  toggleUnit(n) {
    const num = parseInt(n), i = this.selectedUnits.indexOf(num);
    i === -1 ? this.selectedUnits.push(num) : this.selectedUnits.splice(i, 1);
    this.updateUnitSelection();
  }

  updateUnitSelection() {
    document.querySelectorAll('.unit-tag').forEach(t => {
      const n = parseInt(t.dataset.unit);
      t.classList.toggle('selected', this.selectedUnits.includes(n));
    });
    document.getElementById('selectedCount').textContent = this.selectedUnits.length;
    document.getElementById('totalUnitWords').textContent = this.getSelectedWordsCount();
    document.getElementById('startStudyBtn').disabled = !this.selectedUnits.length;
  }

  getSelectedWordsCount() {
    return this.currentVocabulary.units.filter(u => this.selectedUnits.includes(u.unitNumber)).reduce((t, u) => t + u.words.length, 0);
  }

  selectAllUnits() { this.selectedUnits = this.currentVocabulary.units.map(u => u.unitNumber); this.updateUnitSelection(); }
  deselectAllUnits() { this.selectedUnits = []; this.updateUnitSelection(); }

  updateVocabularyModalStats() {
    const total = this.getTotalWords(this.currentVocabulary);
    const mastered = this.getMasteredWords(this.currentVocabulary);
    const learning = total - mastered;
    const review = this.getReviewWords(this.currentVocabulary);
    document.getElementById('modalTotalWords').textContent = total;
    document.getElementById('modalMasteredWords').textContent = mastered;
    document.getElementById('modalLearningWords').textContent = learning;
    document.getElementById('modalReviewWords').textContent = review;
  }

  async startStudy() {
    if (!this.selectedUnits.length) return this.showNotification('请至少选择一个单元', 'error');
    this.config.currentVocabulary = this.currentVocabulary.id;
    this.config.selectedUnits = [...this.selectedUnits];
    await this.saveConfig();
    window.location.href = 'study.html';
  }

  async deleteVocabulary(id) {
    if (!confirm('确定要删除这个词库吗？此操作不可撤销。')) return;
    this.vocabularies = this.vocabularies.filter(v => v.id !== id);
    await this.saveVocabularies();
    this.renderVocabularyList();
    this.updateStats();
    this.showNotification('词库已删除', 'success');
  }

  async updateStats() {
    const total = this.vocabularies.reduce((t, v) => t + this.getTotalWords(v), 0);
    const mastered = this.vocabularies.reduce((t, v) => t + this.getMasteredWords(v), 0);
    const learning = total - mastered;
    const today = await this.getTodayProgress();
    document.getElementById('totalWords').textContent = total;
    document.getElementById('masteredWords').textContent = mastered;
    document.getElementById('learningWords').textContent = learning;
    document.getElementById('todayProgress').textContent = today;
  }

  getTotalWords(v) { return v.units.reduce((t, u) => t + u.words.length, 0); }
  getMasteredWords(v) { return v.units.reduce((t, u) => t + u.words.filter(w => w.mastered).length, 0); }
  getReviewWords(v) { return v.units.reduce((t, u) => t + u.words.filter(w => w.unfamiliar >= 2).length, 0); }

  // ================ 模态框 & 动画 ================
  showImportModal() {
    document.getElementById('importModal').classList.remove('hidden');
    this.selectedFile = null;
    document.getElementById('importBtn').disabled = true;
    const dropZone = document.getElementById('dropZone');
    dropZone.innerHTML = `
      <div class="text-4xl mb-4">📁</div>
      <div class="text-lg font-medium text-gray-700 mb-2">拖拽文件到此处</div>
      <div class="text-sm text-gray-500 mb-4">或点击选择文件</div>
      <input type="file" id="fileInput" accept=".xlsx,.xls" class="hidden">
      <button onclick="document.getElementById('fileInput').click()" class="btn-primary">选择文件</button>`;
    const fileInput = document.getElementById('fileInput');
    fileInput.onchange = e => this.handleFileSelect(e.target.files[0]);
  }

  hideImportModal() { document.getElementById('importModal').classList.add('hidden'); }
  hideVocabularyModal() { document.getElementById('vocabularyModal').classList.add('hidden'); }

  showNotification(msg, type = 'info') {
    const n = document.createElement('div');
    n.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-white ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`;
    n.textContent = msg;
    document.body.appendChild(n);
    anime({ targets: n, translateX: [300, 0], opacity: [0, 1], duration: 300, easing: 'easeOutQuart' });
    setTimeout(() => anime({ targets: n, translateX: [0, 300], opacity: [1, 0], duration: 300, easing: 'easeInQuart', complete: () => n.remove() }), 3000);
  }

  showLoading(msg = '加载中...') {
    const d = document.createElement('div');
    d.id = 'loadingOverlay';
    d.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center';
    d.innerHTML = `<div class="bg-white rounded-lg p-8 text-center"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div><div class="text-gray-700">${msg}</div></div>`;
    document.body.appendChild(d);
  }

  hideLoading() { document.getElementById('loadingOverlay')?.remove(); }

  addSuccessAnimation() {
    const s = document.createElement('div');
    s.innerHTML = '✅';
    s.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-8xl z-50';
    document.body.appendChild(s);
    anime({ targets: s, scale: [0, 1.2, 1], opacity: [0, 1, 0], duration: 2000, easing: 'easeOutElastic(1, .8)', complete: () => s.remove() });
  }

  // ================ 数据持久化：全部改为 IndexedDB ================
  async saveVocabularies() { await idb.set(idb.STORE_VOCABS, this._keys.vocabs, this.vocabularies); }
  async loadVocabularies() { this.vocabularies = (await idb.get(idb.STORE_VOCABS, this._keys.vocabs)) || []; }
  async saveConfig() { await idb.set(idb.STORE_CONFIG, this._keys.config, this.config); }
  async loadConfig() { return (await idb.get(idb.STORE_CONFIG, this._keys.config)) || { currentVocabulary: null, selectedUnits: [], studyMode: 'random', dailyGoal: 50, reviewThreshold: 5, theme: 'light' }; }
  async getTodayProgress() {
    const today = new Date().toISOString().split('T')[0];
    const progress = (await idb.get(idb.STORE_PROGRESS, this._keys.progress)) || {};
    return progress[today] || 0;
  }
}

// ========================= 全局函数 =========================
const showImportModal = () => app.showImportModal();
const hideImportModal = () => app.hideImportModal();
const hideVocabularyModal = () => app.hideVocabularyModal();
const importVocabulary = () => app.importVocabulary();
const selectAllUnits = () => app.selectAllUnits();
const deselectAllUnits = () => app.deselectAllUnits();
const startStudy = () => app.startStudy();

// ========================= 初始化 =========================
let app;
document.addEventListener('DOMContentLoaded', async () => {
  app = new WordMasterApp();
  await app.init();
});