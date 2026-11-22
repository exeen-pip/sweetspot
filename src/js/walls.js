/* ================= sp — обои и мотивация ✦ ================= */
const Walls = {
  open() {
    const box = el('div', 'walls-box');
    box.innerHTML = `
      <h2>обои ✦ пинтерест-вайб</h2>
      <div class="row" style="margin:10px 0">
        <input id="wall-q" placeholder="что хочешь видеть? например: coquette aesthetic" style="flex:1">
        <button class="btn mini" id="wall-go">найти ✧</button>
      </div>
      <div class="row wall-chips" id="wall-chips" style="margin-bottom:10px;flex-wrap:wrap"></div>
      <div class="wall-grid" id="wall-grid">
        <div class="wall-status muted">найди фото — потом «на обои ♡» или «мотивация ✦»</div>
      </div>`;

    const chips = ['coquette aesthetic', 'study aesthetic', 'soft pink', 'motivation', 'romanticize studying', 'journaling aesthetic'];
    const ch = box.querySelector('#wall-chips');
    for (const c of chips) {
      const b = el('button', 'btn outline mini', c);
      b.onclick = () => { box.querySelector('#wall-q').value = c; Walls.search(box); };
      ch.appendChild(b);
    }
    box.querySelector('#wall-go').onclick = () => Walls.search(box);
    box.querySelector('#wall-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') Walls.search(box); });
    openModal(box);
    setTimeout(() => box.querySelector('#wall-q').focus(), 60);
  },

  async search(box) {
    const q = box.querySelector('#wall-q').value.trim() || 'coquette aesthetic';
    const grid = box.querySelector('#wall-grid');
    grid.innerHTML = '<div class="wall-status muted">ищу на просторах… ✧</div>';
    const res = await window.sp.walls.search(q);
    if (!res || res.error || (res.length === 0)) {
      grid.innerHTML = '<div class="wall-status muted">по «' + esc(q) + '» не нашлось — попробуй другое слово ♡' +
        (res && res.error ? '<br><br><span style="font-size:11px">' + esc(res.error) + '</span>' : '') + '</div>';
      return;
    }
    grid.innerHTML = '';
    for (const it of res) {
      const img = document.createElement('img');
      img.className = 'wall-thumb';
      img.loading = 'lazy';
      img.src = it.thumb;
      img.title = it.author ? 'photo: ' + it.author + ' · unsplash' : 'unsplash';
      img.onclick = () => Walls.preview(it);
      grid.appendChild(img);
    }
  },

  preview(item) {
    const ov = el('div', 'wall-overlay');
    ov.innerHTML = `
      <img id="ov-img" src="${esc(item.thumb)}">
      <div class="wall-overlay-bar">
        <button class="btn" id="ov-bg">на обои ♡</button>
        <button class="btn outline" id="ov-mot">мотивация ✦</button>
        <span style="font-size:12px;color:#fff">${esc(item.author || '')} · unsplash</span>
        <button class="ghost-btn" id="ov-x" style="color:#fff">×</button>
      </div>`;
    document.body.appendChild(ov);

    const img = ov.querySelector('#ov-img');
    const big = new Image();
    big.src = item.full || item.thumb;
    big.onload = () => { img.src = item.full || item.thumb; };

    const close = () => { document.removeEventListener('keydown', onKey); ov.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    ov.addEventListener('click', (e) => {
      if (e.target === ov || ov.classList.contains('motivate')) close();
    });
    ov.querySelector('#ov-x').onclick = close;
    ov.querySelector('#ov-mot').onclick = (e) => { e.stopPropagation(); ov.classList.add('motivate'); };
    ov.querySelector('#ov-bg').onclick = async (e) => {
      e.stopPropagation();
      const btn = e.target;
      btn.textContent = 'ставлю…';
      const r = await window.sp.walls.save(item);
      if (r && r.ok) {
        Store.patch(d => { d.ui.bgFile = r.file; });
        applyUi();
        toast('обои поставлены ♡');
        close();
      } else {
        btn.textContent = 'не вышло 😢';
      }
    };
  }
};
