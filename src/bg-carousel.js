// Background image carousel — mirrors the approach in CRxUAL-Virtual-Exhibiton-2026/src/ui/TitleScreen.js
// rAF-driven, two mirrored strips per row, staggered speeds + alternating directions

const BASE_SPEED = 38;  // px/s for row 0
const SPEED_STEP = 14;  // added per row index (mod 3) — subtle parallax
const ROW_HEIGHT = 200; // target px per row — drives row count
const MAX_ROWS   = 4;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function initBgCarousel(container) {
  const base = import.meta.env.BASE_URL;

  const IMAGES = [
    'targets/compiled/BeNotAfraid-RysiaAnnaKaczmar2_thumbnail.png',
    'targets/compiled/Birdcage-JichuZhang/Birdcage-JichuZhang_thumbnail.jpg',
    'targets/compiled/BlackSwan-JieunSung/BlackSwan-JieunSung_thumbnail.jpg',
    'targets/compiled/Dehumanized-ChiAnChou2_thumbnail.png',
    'targets/compiled/EMBODIED-VeepraMishra/EMBODIED-VeepraMishra_thumbnail.jpg',
    'targets/compiled/EmbodiedMemories-YoonJuChung/EmbodiedMemories-YoonJuChung_thumbnail.jpg',
    'targets/compiled/FauxFlora-JustinaAlexandroff/FauxFlora-JustinaAlexandroff_thumbnail.jpg',
    'targets/compiled/LetMeEatCake-SuzannaTeal/LetMeEatCake-SuzannaTeal_thumbnail.jpg',
    'targets/compiled/LustFeelsLikeBadLuck-JuliaPytko2_thumbnail.png',
    'targets/compiled/MarieSaintYves/MarieSaintYves_thumbnail.jpg',
    'targets/compiled/MaterialPlace-NeveBeill2_thumbnail.png',
    'targets/compiled/Nailed-GenevieveCarr/Nailed-GenevieveCarr_thumbnail.jpg',
    'targets/compiled/NoLongerUs-JunShya/NoLongerUs-JunShya_thumbnail.jpg',
    'targets/compiled/Pseudosynthesis-LeonLin2_thumbnail.png',
    'targets/compiled/Self-Finish-BeatriceElAsmar2_thumbnail.png',
    'targets/compiled/Symbion-ShuyangWang_thumbnail.png',
    'targets/compiled/SynestheticSkin-JianingDing2_thumbnail.png',
    'targets/compiled/TheNoos-SanneWinderickx_thumbnail.png',
    'targets/compiled/Unrendered-Marie-LisetteCropp2_thumbnail.jpg',
    'targets/compiled/WhimsyThroughTheWindow-SarahAbdi/WhimsyThroughTheWindow-SarahAbdi_thumbnail.jpg',
    'targets/compiled/YiyuChoeyChen/tar_YiyuChoeyChen_thumbnail.jpg',
  ].map(p => base + p);

  const numRows = Math.max(2, Math.min(MAX_ROWS, Math.round(window.innerHeight / ROW_HEIGHT)));

  const bg = document.createElement('div');
  bg.className = 'home-bg';
  bg.setAttribute('aria-hidden', 'true');
  container.prepend(bg);

  const rows = [];
  for (let i = 0; i < numRows; i++) {
    const lane   = document.createElement('div');
    lane.className = 'bg-lane';

    const inner  = document.createElement('div');
    inner.className = 'bg-lane-inner';

    const stripA = document.createElement('div');
    const stripB = document.createElement('div');
    stripA.className = stripB.className = 'bg-strip';

    inner.appendChild(stripA);
    inner.appendChild(stripB);
    lane.appendChild(inner);
    bg.appendChild(lane);

    rows.push({
      inner, stripA, stripB,
      x:     0,
      speed: BASE_SPEED + (i % 3) * SPEED_STEP,
      dir:   i % 2 === 0 ? 1 : -1,
    });
  }

  _populate(rows, IMAGES);

  let last  = performance.now();
  let rafId = requestAnimationFrame(function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    for (const row of rows) {
      const w = row.stripA.scrollWidth;
      if (w === 0) { rafId = requestAnimationFrame(tick); return; }

      row.x = (row.x + row.speed * dt) % w;
      // dir 1 → left scroll, dir -1 → right scroll (reads strip from its end)
      const offset = row.dir === 1 ? -row.x : -(w - row.x);
      row.inner.style.transform = `translateX(${offset}px)`;
    }

    rafId = requestAnimationFrame(tick);
  });

  return () => cancelAnimationFrame(rafId);
}

async function _populate(rows, images) {
  // Initial fill — images fade in as they load
  for (const row of rows) {
    for (const url of shuffle(images)) {
      row.stripA.appendChild(_makeImg(url, false));
    }
  }

  // Wait two frames so the browser has laid out and scrollWidth is real
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));

  // Rebuild each stripA with visible images (cached by now), repeat until wider than viewport
  for (const row of rows) {
    row.stripA.innerHTML = '';
    const pool = shuffle(images);
    for (const url of pool) row.stripA.appendChild(_makeImg(url, true));

    while (row.stripA.scrollWidth < window.innerWidth + 100) {
      for (const url of shuffle(images)) row.stripA.appendChild(_makeImg(url, true));
    }

    // Mirror into stripB — identical content, seam always off-screen
    row.stripB.innerHTML = row.stripA.innerHTML;
    row.x = row.x % row.stripA.scrollWidth;
  }
}

function _makeImg(url, visible) {
  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  img.decoding = 'async';
  if (visible) {
    img.classList.add('bg-img--visible');
  } else {
    img.addEventListener('load', () => img.classList.add('bg-img--visible'), { once: true });
  }
  return img;
}
