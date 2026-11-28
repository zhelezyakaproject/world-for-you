// Дневник хозяина мира: обложка и записи — в diary-pages.js (после знакомства хозяин пишет туда о госте).
// Берётся в руку, страница раскрывается над ним, курок листает записи.
import * as THREE from 'three';
import { glowSprite } from './words.js';
import { DIARY, COVER } from './diary-pages.js';

export function makeDiary(W, group, { pos, rot = [-0.5, 0.5, 0.1], isActive }) {
  const diary = new THREE.Group(); diary.name = 'дневник'; diary.position.copy(pos); diary.rotation.set(...rot); group.add(diary);
  const coverTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 704; const x = c.getContext('2d');
    x.fillStyle = '#1b2a4a'; x.fillRect(0, 0, 512, 704); for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`; x.fillRect(Math.random() * 512, Math.random() * 704, 2, 2); }
    x.strokeStyle = '#c9a25a'; x.lineWidth = 4; x.strokeRect(28, 28, 456, 648); x.fillStyle = '#e2c27a'; x.textAlign = 'center';
    x.font = '700 54px Georgia, serif'; x.fillText(COVER.title, 256, 230); x.font = '400 40px Georgia, serif'; x.fillText(COVER.author, 256, 300);
    x.font = '400 26px Georgia, serif'; (COVER.lines || []).forEach((l, i) => x.fillText(l, 256, 420 + i * 42)); x.fillText(COVER.date || '', 256, 600);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 0.8 }), paper = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.9 });
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.026, 0.235), [coverMat, coverMat, new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.75 }), coverMat, paper, coverMat]);
  const pagesEdge = new THREE.Mesh(new THREE.BoxGeometry(0.162, 0.02, 0.228), paper); pagesEdge.position.x = 0.003; diary.add(book, pagesEdge);
  const warm = glowSprite(0xffc890, 0.9, 0.22); diary.add(warm);
  const pageC = document.createElement('canvas'); pageC.width = 1024; pageC.height = 720; const px = pageC.getContext('2d'); const pageTex = new THREE.CanvasTexture(pageC); pageTex.colorSpace = THREE.SRGBColorSpace; pageTex.anisotropy = 8;
  const page = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), new THREE.MeshBasicMaterial({ map: pageTex, color: 0xb4ae9f, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false }));
  page.position.set(0, 0.2, -0.05); page.rotation.x = -0.35; diary.add(page);
  let pageN = -1, pageA = 0, lastGrabEvent = -99; const y0 = pos.y;
  function showPage(i) {
    pageN = ((i % DIARY.length) + DIARY.length) % DIARY.length; const d = DIARY[pageN];
    px.fillStyle = '#f4ecd9'; px.fillRect(0, 0, 1024, 720); px.fillStyle = '#8a7a5a'; px.font = '400 26px Georgia, serif'; px.textAlign = 'left'; px.fillText(`запись ${d.n} · ${COVER.title.toLowerCase()} · ${COVER.author}`, 60, 70);
    px.fillStyle = '#23201a'; px.font = '400 38px Georgia, serif'; let y = 150, line = '';
    for (const w of d.text.split(' ')) { if (px.measureText(line + w).width > 900) { px.fillText(line, 60, y); y += 54; line = ''; } line += w + ' '; } px.fillText(line, 60, y);
    px.fillStyle = '#8a7a5a'; px.font = '400 24px Georgia, serif'; px.fillText(`${pageN + 1} / ${DIARY.length} · курок — следующая запись`, 60, 680);
    pageTex.needsUpdate = true; W.fx.sound('swish');
  }
  const dg = W.input.addGrab(diary, { name: 'дневник', r: 0.2, far: true, farDist: 3, holdDist: 0.02,
    onGrab() { if (pageN < 0) showPage(0); if (W.t - lastGrabEvent > 25) { lastGrabEvent = W.t; W.net.event('гость взял дневник',
 { запись: DIARY[pageN].n }, true); } },
    onRelease() { W.net.event('гость отпустил дневник', {}); } });
  W.on('trigger', (h) => { if (dg.held === h) { showPage(pageN + 1); W.net.event('гость листает дневник', { запись: DIARY[pageN].n }); } });
  W.actions.page = (n) => { if (!Number.isInteger(n)) throw new Error(`номер страницы дневника: 0…${DIARY.length - 1}`); showPage(n); };
  return { obj: diary, grab: dg, showPage,
    note: () => (dg.held ? ' · дневник в руке, запись ' + DIARY[pageN]?.n : ''),
    get entry() { return DIARY[Math.max(0, pageN)].n; },
    // страница видна, пока дневник в руке; без руки он чуть покачивается на месте
    update(dt) { pageA += ((dg.held ? 1 : 0) - pageA) * Math.min(1, dt * 6); page.material.opacity = pageA; page.visible = pageA > 0.02;
      if (!dg.held && Math.abs(diary.position.y - y0) < 0.05) diary.position.y = y0 + Math.sin(W.t * 0.8) * 0.012; warm.visible = !dg.held; } };
}
