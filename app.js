(() => {
  'use strict';

  const W = 1200;
  const H = 760;
  const PAPER = { left: 12, right: 1188, top: 18, bottom: 741 };
  const EDGE_TOUCH = 78;
  const EDGE_MOUSE = 57;
  const STEP = 6;
  const MAX_SAMPLES = 480;
  const stages = {
    entry: document.getElementById('entry'),
    envelope: document.getElementById('envelope-scene'),
    card: document.getElementById('card-scene')
  };
  const form = document.getElementById('name-form');
  const input = document.getElementById('guest-name');
  const message = document.getElementById('name-message');
  const cardName = document.getElementById('card-name');
  const assembly = document.getElementById('envelope-assembly');
  const canvas = document.getElementById('envelope-canvas');
  const instruction = document.getElementById('tear-instruction');
  const fallback = document.getElementById('tear-fallback');
  const audio = document.getElementById('theme-audio');
  const musicButtons = Array.from(document.querySelectorAll('[data-music-toggle]'));
  const musicStatus = document.getElementById('music-status');
  const entryHelp = '你的名字将写在信上，进入后音乐自动播放。';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const images = {};
  const cssWidthAtStart = Math.min(760, Math.max(280, window.innerWidth - (window.innerWidth <= 760 ? 40 : 156)));
  let scale = backingScale(cssWidthAtStart);

  function backingScale(cssWidth) {
    return Math.max(.35, Math.min(1.05, cssWidth * Math.min(window.devicePixelRatio || 1, 2) / W));
  }

  const makeLayer = () => {
    const element = document.createElement('canvas');
    element.width = Math.round(W * scale);
    element.height = Math.round(H * scale);
    const context = element.getContext('2d', { alpha: true });
    context.setTransform(scale, 0, 0, scale, 0, 0);
    return { element, context };
  };
  const paper = makeLayer();
  const cutPaper = makeLayer();
  const fiberEdges = makeLayer();
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  let guest = '';
  let tears = [];
  let activePointer = null;
  let activeTear = null;
  let activeWasNew = false;
  let samplesAtDown = 0;
  let renderFrame = null;
  let openTimer = null;
  let opening = false;
  let imagesReady = false;
  let musicGeneration = 0;
  let musicNeedsTap = false;

  function syncMusicControls() {
    const playing = !audio.paused && !audio.ended;
    for (const button of musicButtons) {
      button.setAttribute('aria-pressed', String(playing));
      button.setAttribute('aria-label', `${playing ? '暂停' : musicNeedsTap ? '点击播放' : '播放'} Кино《一颗名为太阳的星》`);
      button.classList.toggle('needs-tap', musicNeedsTap && !playing);
      button.querySelector('.music-glyph').textContent = playing ? 'Ⅱ' : '▶';
      button.querySelector('.music-state').textContent = playing ? '暂停' : musicNeedsTap ? '点此播放' : '播放';
    }
  }

  function resetMusic() {
    musicGeneration += 1;
    musicNeedsTap = false;
    audio.pause();
    try { audio.currentTime = 0; } catch (_error) { /* Metadata may not be loaded yet. */ }
    musicStatus.textContent = '';
    syncMusicControls();
  }

  function startMusic() {
    const generation = musicGeneration;
    if (audio.ended) audio.currentTime = 0;
    // The call stays in the user's submit or click event, including on iOS.
    let attempt;
    try { attempt = audio.play(); }
    catch (_error) {
      musicNeedsTap = true;
      musicStatus.textContent = '自动播放未成功，请点击音乐按钮播放。';
      syncMusicControls();
      return;
    }
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        if (generation !== musicGeneration) return;
        musicNeedsTap = true;
        musicStatus.textContent = '自动播放未成功，请点击音乐按钮播放。';
        syncMusicControls();
      });
    }
  }

  for (const button of musicButtons) {
    button.addEventListener('click', () => {
      if (!audio.paused && !audio.ended) {
        audio.pause();
        musicNeedsTap = false;
        musicStatus.textContent = '音乐已暂停。';
        return;
      }
      startMusic();
    });
  }
  audio.addEventListener('play', () => {
    musicNeedsTap = false;
    musicStatus.textContent = '音乐正在播放。';
    syncMusicControls();
  });
  audio.addEventListener('pause', syncMusicControls);
  audio.addEventListener('ended', () => {
    musicStatus.textContent = '音乐已播放完毕。';
    syncMusicControls();
  });
  audio.addEventListener('error', () => {
    musicStatus.textContent = '音乐文件暂时无法加载。';
    syncMusicControls();
  });

  const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const smoothstep = (value) => {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  };
  function paperNoise(position, seed) {
    const index = Math.floor(position);
    const fraction = smoothstep(position - index);
    const sample = (value) => {
      const decimal = Math.sin((value + seed * 13.73) * 127.17) * 43758.5453;
      return (decimal - Math.floor(decimal)) * 2 - 1;
    };
    return sample(index) * (1 - fraction) + sample(index + 1) * fraction;
  }
  function loadImage(key, url) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => { images[key] = image; resolve(); };
      image.onerror = () => { images[key] = null; resolve(); };
      image.src = url;
    });
  }

  function spacedText(context, content, x, y, spacing) {
    let cursor = x;
    for (const character of Array.from(content)) {
      context.fillText(character, cursor, y);
      cursor += context.measureText(character).width + spacing;
    }
  }

  function nameRows(value) {
    const characters = Array.from(value);
    const count = characters.length;
    const rows = [];
    if (/\s/.test(value) && /[A-Za-z]/.test(value)) {
      const words = value.split(' ').filter(Boolean);
      const maxChars = count > 18 ? 14 : 16;
      for (const word of words) {
        if (rows.length && rows[rows.length - 1].length + word.length + 1 <= maxChars) {
          rows[rows.length - 1] += ' ' + word;
        } else if (word.length <= maxChars) {
          rows.push(word);
        } else {
          for (let index = 0; index < word.length; index += maxChars) rows.push(word.slice(index, index + maxChars));
        }
      }
    } else {
      const columns = count <= 8 ? count : count <= 16 ? Math.ceil(count / 2) : Math.ceil(count / 3);
      for (let index = 0; index < count; index += columns) rows.push(characters.slice(index, index + columns).join(''));
    }
    return rows;
  }

  function paintName(context) {
    if (!guest) return;
    const count = Array.from(guest).length;
    const rows = nameRows(guest);
    const size = count <= 4 ? 82 : count <= 6 ? 74 : count <= 8 ? 64 : count <= 12 ? 60 : count <= 16 ? 53 : count <= 20 ? 54 : 50;
    const top = rows.length > 2 ? 474 : rows.length > 1 ? 480 : 514;
    context.save();
    context.textBaseline = 'alphabetic';
    context.fillStyle = '#8b3036';
    context.font = '700 19px Arial, Microsoft YaHei, sans-serif';
    spacedText(context, 'TO / 致', 132, 412, 5);
    context.fillStyle = '#292722';
    context.strokeStyle = 'rgba(250,246,238,.55)';
    context.lineWidth = .65;
    context.font = `800 ${size}px "Noto Serif CJK SC", "Songti SC", "SimSun", serif`;
    const tracking = count > 16 ? 2 : 4;
    for (let row = 0; row < rows.length; row += 1) {
      let x = 132;
      const y = top + row * size * 1.18;
      for (const character of Array.from(rows[row])) {
        context.strokeText(character, x, y);
        context.fillText(character, x, y);
        x += context.measureText(character).width + tracking;
      }
    }
    context.restore();
  }

  function buildPaper() {
    const base = paper.context;
    base.clearRect(0, 0, W, H);
    if (images.face) {
      base.drawImage(images.face, 0, 0, W, H);
    } else {
      base.fillStyle = '#eae3d7';
      base.fillRect(PAPER.left, PAPER.top, PAPER.right - PAPER.left, PAPER.bottom - PAPER.top);
    }
    if (images.texture) {
      // Grain belongs to the actual sheet, including the name underneath the tear.
      base.save();
      base.globalCompositeOperation = 'multiply';
      base.globalAlpha = .22;
      base.drawImage(images.texture, PAPER.left, PAPER.top, PAPER.right - PAPER.left, PAPER.bottom - PAPER.top);
      base.restore();
      base.save();
      base.globalCompositeOperation = 'soft-light';
      base.globalAlpha = .12;
      base.drawImage(images.texture, PAPER.left, PAPER.top, PAPER.right - PAPER.left, PAPER.bottom - PAPER.top);
      base.restore();
    }
    const light = base.createRadialGradient(215, 94, 10, 520, 320, 850);
    light.addColorStop(0, 'rgba(255,253,246,.24)');
    light.addColorStop(1, 'rgba(89,70,53,.13)');
    base.save();
    base.globalCompositeOperation = 'soft-light';
    base.fillStyle = light;
    base.fillRect(PAPER.left, PAPER.top, PAPER.right - PAPER.left, PAPER.bottom - PAPER.top);
    base.restore();
    paintName(base);
    scheduleRender();
  }

  function resizeBacking() {
    const cssWidth = assembly.getBoundingClientRect().width;
    if (!cssWidth) return;
    const nextScale = backingScale(cssWidth);
    if (Math.abs(nextScale - scale) < .025) return;
    scale = nextScale;
    for (const layer of [paper, cutPaper, fiberEdges]) {
      layer.element.width = Math.round(W * scale);
      layer.element.height = Math.round(H * scale);
      layer.context.setTransform(scale, 0, 0, scale, 0, 0);
    }
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    buildPaper();
  }

  function screenToPaper(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * W / rect.width,
      y: (event.clientY - rect.top) * H / rect.height
    };
  }

  function pointInside(point) {
    return point.x >= 0 && point.x <= W && point.y >= 0 && point.y <= H;
  }

  function edgeAt(point, radius) {
    if (!pointInside(point)) return null;
    const near = [
      { side: 'left', distance: Math.abs(point.x - PAPER.left) },
      { side: 'right', distance: Math.abs(PAPER.right - point.x) },
      { side: 'top', distance: Math.abs(point.y - PAPER.top) },
      { side: 'bottom', distance: Math.abs(PAPER.bottom - point.y) }
    ].sort((a, b) => a.distance - b.distance)[0];
    return near.distance <= radius ? near.side : null;
  }

  function edgeOrigin(point, side) {
    if (side === 'left') return { x: PAPER.left, y: clamp(point.y, PAPER.top + 25, PAPER.bottom - 25) };
    if (side === 'right') return { x: PAPER.right, y: clamp(point.y, PAPER.top + 25, PAPER.bottom - 25) };
    if (side === 'top') return { x: clamp(point.x, PAPER.left + 25, PAPER.right - 25), y: PAPER.top };
    return { x: clamp(point.x, PAPER.left + 25, PAPER.right - 25), y: PAPER.bottom };
  }

  function clampedPoint(point) {
    return { x: clamp(point.x, PAPER.left, PAPER.right), y: clamp(point.y, PAPER.top, PAPER.bottom) };
  }

  function createTear(side, point, pointerType) {
    const origin = edgeOrigin(point, side);
    const tear = {
      side,
      samples: [{ x: origin.x, y: origin.y, s: 0 }],
      seed: tears.length * 7.47 + 1.9,
      width: pointerType === 'mouse' ? 1.28 : 1
    };
    tears.push(tear);
    addPoint(tear, clampedPoint(point));
    return tear;
  }

  function addPoint(tear, target) {
    const samples = tear.samples;
    const last = samples[samples.length - 1];
    const travel = distance(last, target);
    if (travel < 2 || samples.length >= MAX_SAMPLES) return;
    const steps = Math.min(MAX_SAMPLES - samples.length, Math.ceil(travel / STEP));
    for (let index = 1; index <= steps; index += 1) {
      const fraction = index / steps;
      const next = {
        x: last.x + (target.x - last.x) * fraction,
        y: last.y + (target.y - last.y) * fraction
      };
      const previous = samples[samples.length - 1];
      next.s = previous.s + distance(previous, next);
      samples.push(next);
    }
  }

  function tearDepth(tear) {
    if (tear.side === 'left') return Math.max(...tear.samples.map((sample) => sample.x)) - PAPER.left;
    if (tear.side === 'right') return PAPER.right - Math.min(...tear.samples.map((sample) => sample.x));
    if (tear.side === 'top') return Math.max(...tear.samples.map((sample) => sample.y)) - PAPER.top;
    return PAPER.bottom - Math.min(...tear.samples.map((sample) => sample.y));
  }

  function tearReadyToOpen(tear) {
    const total = tear.samples[tear.samples.length - 1].s;
    const requiredDepth = (tear.side === 'left' || tear.side === 'right') ? W * .43 : H * .44;
    return total > requiredDepth + 35 && tearDepth(tear) > requiredDepth;
  }

  function geometry(tear) {
    const samples = tear.samples;
    if (samples.length < 3 || samples[samples.length - 1].s < 15) return null;
    // The entrance stays connected to the edge; the live end is blunt and fibrous.
    const left = [];
    const right = [];
    const points = [];
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      const before = samples[Math.max(0, index - 1)];
      const after = samples[index === 0 ? Math.min(1, samples.length - 1) : index];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const d = Math.hypot(dx, dy) || 1;
      const normal = { x: -dy / d, y: dx / d };
      // A sample's cut width stays fixed as the pointer moves or doubles back.
      const broad = (31 + 10 * Math.exp(-sample.s / 170)) * tear.width;
      // Irregular, spatially coherent paper grain avoids repetitive sine waves.
      const rag = 2.7 * paperNoise(sample.s / 61, tear.seed) +
        1.15 * paperNoise(sample.s / 24, tear.seed + 4) +
        2.15 * paperNoise(sample.s / 8.4, tear.seed + 12);
      const a = Math.max(1.4, broad + rag);
      const b = Math.max(1.4, (broad - rag * .58 + .7 * paperNoise(sample.s / 32, tear.seed + 8) +
        1.55 * paperNoise(sample.s / 9.7, tear.seed + 21)));
      const leftPoint = { x: sample.x + normal.x * a, y: sample.y + normal.y * a };
      const rightPoint = { x: sample.x - normal.x * b, y: sample.y - normal.y * b };
      left.push(leftPoint);
      right.push(rightPoint);
      points.push({ x: sample.x, y: sample.y, normal, s: sample.s });
    }
    return { left, right, points };
  }

  function pathBetween(context, a, b) {
    context.beginPath();
    context.moveTo(a[0].x, a[0].y);
    for (let index = 1; index < a.length; index += 1) context.lineTo(a[index].x, a[index].y);
    for (let index = b.length - 1; index >= 0; index -= 1) context.lineTo(b[index].x, b[index].y);
    context.closePath();
  }

  function pathAlong(context, points) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
  }

  function drawBackground() {
    ctx.clearRect(0, 0, W, H);
    if (images.inner) ctx.drawImage(images.inner, 0, 0, W, H);
    else {
      ctx.fillStyle = '#101011';
      ctx.fillRect(8, 8, W - 16, H - 16);
      ctx.fillStyle = '#a7202b';
      ctx.beginPath();
      ctx.arc(955, 362, 224, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#101011';
      ctx.beginPath();
      ctx.arc(955, 362, 125, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(955, 362);
      ctx.rotate(-29 * Math.PI / 180);
      ctx.fillRect(-285, -24, 570, 48);
      ctx.restore();
    }
  }

  function drawUnderShadow(shape) {
    ctx.save();
    ctx.shadowColor = 'rgba(29,10,13,.46)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(33,14,16,.34)';
    ctx.lineWidth = 6;
    for (const bank of [shape.left, shape.right]) {
      pathAlong(ctx, bank);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCutPaper(shapes) {
    const layer = cutPaper.context;
    layer.clearRect(0, 0, W, H);
    layer.drawImage(paper.element, 0, 0, W, H);
    layer.save();
    layer.globalCompositeOperation = 'destination-out';
    layer.fillStyle = '#000';
    for (const shape of shapes) {
      layer.save();
      layer.beginPath();
      layer.rect(PAPER.left, PAPER.top, PAPER.right - PAPER.left, PAPER.bottom - PAPER.top);
      layer.clip();
      // Each strip removes paper independently. A self-crossing path cannot
      // reverse the cut through the even-odd fill rule.
      for (let index = 1; index < shape.left.length; index += 1) {
        layer.beginPath();
        layer.moveTo(shape.left[index - 1].x, shape.left[index - 1].y);
        layer.lineTo(shape.left[index].x, shape.left[index].y);
        layer.lineTo(shape.right[index].x, shape.right[index].y);
        layer.lineTo(shape.right[index - 1].x, shape.right[index - 1].y);
        layer.closePath();
        layer.fill();
      }
      // Round joins prevent pinholes where a hand makes a sharp turn.
      layer.beginPath();
      for (let index = 0; index < shape.points.length; index += 1) {
        const point = shape.points[index];
        const radius = Math.min(distance(point, shape.left[index]), distance(point, shape.right[index])) * .96;
        layer.moveTo(point.x + radius, point.y);
        layer.arc(point.x, point.y, radius, 0, Math.PI * 2);
      }
      layer.fill();
      layer.restore();
    }
    layer.restore();
    ctx.drawImage(cutPaper.element, 0, 0, W, H);
  }

  function drawFlatEdge(edgeContext, shape, bank, side, seed) {
    const cutSide = [];
    const paperSide = [];
    for (let index = 0; index < bank.length; index += 1) {
      const edge = bank[index];
      const info = shape.points[index];
      const n = info.normal;
      const variation = paperNoise(info.s / 8.2, seed + side * 6);
      const thickness = 4.4 + 1.15 * paperNoise(info.s / 41, seed + 3) + 1.05 * variation;
      cutSide.push({
        x: edge.x - n.x * side * (1.2 + .9 * variation),
        y: edge.y - n.y * side * (1.2 + .9 * variation)
      });
      paperSide.push({
        x: edge.x + n.x * side * thickness,
        y: edge.y + n.y * side * thickness
      });
    }

    edgeContext.save();
    // A thin cotton core lies flush with the photograph. It is never a lifted flap.
    pathBetween(edgeContext, cutSide, paperSide);
    edgeContext.fillStyle = 'rgba(233,225,212,.9)';
    edgeContext.fill();
    if (images.texture) {
      edgeContext.save();
      pathBetween(edgeContext, cutSide, paperSide);
      edgeContext.clip();
      edgeContext.globalCompositeOperation = 'multiply';
      edgeContext.globalAlpha = .4;
      edgeContext.drawImage(images.texture, PAPER.left, PAPER.top, PAPER.right - PAPER.left, PAPER.bottom - PAPER.top);
      edgeContext.restore();
    }

    // A nearly invisible compression line and scattered cut fibers break the edge.
    pathAlong(edgeContext, paperSide);
    edgeContext.lineWidth = .7;
    edgeContext.strokeStyle = 'rgba(92,76,64,.13)';
    edgeContext.stroke();
    for (let index = 5; index < bank.length - 3; index += 2) {
      const info = shape.points[index];
      const chance = paperNoise(index * .72, seed + 19);
      if (chance < .15) continue;
      const edge = bank[index];
      const n = info.normal;
      const before = bank[Math.max(0, index - 1)];
      const after = bank[Math.min(bank.length - 1, index + 1)];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const tangentLength = Math.hypot(dx, dy) || 1;
      const reach = 2.5 + 7.1 * Math.max(0, chance);
      const drift = paperNoise(index * 1.17, seed + 29) * 2.3;
      edgeContext.beginPath();
      edgeContext.moveTo(edge.x + n.x * side, edge.y + n.y * side);
      edgeContext.lineTo(
        edge.x - n.x * side * reach + dx / tangentLength * drift,
        edge.y - n.y * side * reach + dy / tangentLength * drift
      );
      edgeContext.lineWidth = .55 + .48 * Math.max(0, chance);
      edgeContext.strokeStyle = `rgba(251,247,237,${.42 + .32 * Math.max(0, chance)})`;
      edgeContext.stroke();
    }
    edgeContext.restore();
  }

  function render() {
    renderFrame = null;
    drawBackground();
    const shapes = tears.map((tear) => ({ tear, shape: geometry(tear) })).filter((item) => item.shape);
    for (const item of shapes) drawUnderShadow(item.shape);
    drawCutPaper(shapes.map((item) => item.shape));
    const edgeContext = fiberEdges.context;
    edgeContext.clearRect(0, 0, W, H);
    for (const item of shapes) {
      drawFlatEdge(edgeContext, item.shape, item.shape.left, 1, item.tear.seed);
      drawFlatEdge(edgeContext, item.shape, item.shape.right, -1, item.tear.seed + 7.1);
    }
    // Fibers only sit on paper that remains after every cut.
    edgeContext.save();
    edgeContext.globalCompositeOperation = 'destination-in';
    edgeContext.drawImage(cutPaper.element, 0, 0, W, H);
    edgeContext.restore();
    ctx.drawImage(fiberEdges.element, 0, 0, W, H);
  }

  function scheduleRender() {
    if (renderFrame !== null) return;
    renderFrame = window.requestAnimationFrame(render);
  }

  function normalizeName(value) {
    return Array.from(
      value.normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    ).slice(0, 24).join('');
  }

  function setMessage(value, error = false) {
    message.textContent = value;
    message.classList.toggle('error', error);
    input.setAttribute('aria-invalid', String(error));
  }

  function showStage(name) {
    if (name === 'entry') resetMusic();
    for (const [stageName, section] of Object.entries(stages)) section.hidden = stageName !== name;
    if (name === 'envelope') resizeBacking();
    window.scrollTo(0, 0);
    const heading = stages[name].querySelector('h1, h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  function setGuest(value) {
    guest = value;
    cardName.textContent = value;
    buildPaper();
  }

  function resetEnvelope() {
    window.clearTimeout(openTimer);
    if (renderFrame !== null) window.cancelAnimationFrame(renderFrame);
    renderFrame = null;
    opening = false;
    activePointer = null;
    activeTear = null;
    activeWasNew = false;
    tears = [];
    fallback.disabled = false;
    assembly.classList.remove('is-dragging', 'is-opening', 'is-torn', 'is-ready');
    instruction.textContent = '从信封任一边缘按住并向里滑动，沿你的手势撕开纸面。';
    scheduleRender();
  }

  function openEnvelope(afterTear = false) {
    if (opening || !guest) return;
    opening = true;
    fallback.disabled = true;
    assembly.classList.remove('is-dragging');
    assembly.classList.add('is-opening');
    openTimer = window.setTimeout(() => showStage('card'), reducedMotion.matches ? 0 : afterTear ? 1250 : 190);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = normalizeName(input.value);
    if (!name) {
      setMessage('请先写下你的名字，才能领取信封。', true);
      input.focus();
      return;
    }
    input.value = name;
    setMessage(entryHelp);
    setGuest(name);
    resetEnvelope();
    showStage('envelope');
    startMusic();
  });

  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') setMessage(entryHelp);
  });

  assembly.addEventListener('pointerdown', (event) => {
    if (opening || activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const start = screenToPaper(event);
    let nearest = null;
    let nearestDistance = event.pointerType === 'touch' ? 68 : 45;
    for (const tear of tears) {
      const end = tear.samples[tear.samples.length - 1];
      const gap = distance(end, start);
      if (gap < nearestDistance) {
        nearest = tear;
        nearestDistance = gap;
      }
    }
    const side = edgeAt(start, event.pointerType === 'touch' ? EDGE_TOUCH : EDGE_MOUSE);
    if (!nearest && !side) {
      instruction.textContent = '请从纸张外缘起撕，再向信封中央滑动。';
      return;
    }
    activeWasNew = !nearest;
    activeTear = nearest || createTear(side, start, event.pointerType);
    samplesAtDown = activeTear.samples.length;
    activePointer = event.pointerId;
    assembly.classList.add('is-dragging');
    assembly.setPointerCapture(event.pointerId);
    if (event.cancelable) event.preventDefault();
  });

  assembly.addEventListener('pointermove', (event) => {
    if (activePointer === null && event.pointerType === 'mouse') {
      const position = screenToPaper(event);
      const nearTip = tears.some((tear) => distance(tear.samples[tear.samples.length - 1], position) < 45);
      assembly.classList.toggle('is-ready', Boolean(edgeAt(position, EDGE_MOUSE) || nearTip));
      return;
    }
    if (activePointer !== event.pointerId || opening) return;
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
    for (const sample of events.length ? events : [event]) addPoint(activeTear, clampedPoint(screenToPaper(sample)));
    scheduleRender();
    if (event.cancelable) event.preventDefault();
  });

  function endPointer(event, cancelled = false) {
    if (activePointer !== event.pointerId) return;
    if (!cancelled) addPoint(activeTear, clampedPoint(screenToPaper(event)));
    const tear = activeTear;
    const moved = tear.samples.length > samplesAtDown + 1;
    if (!moved && activeWasNew) tears = tears.filter((item) => item !== tear);
    else {
      assembly.classList.add('is-torn');
      instruction.textContent = '纸面已经撕开。沿撕口末端继续，或者从另一边缘再撕一道。';
    }
    activePointer = null;
    activeTear = null;
    activeWasNew = false;
    assembly.classList.remove('is-dragging');
    if (assembly.hasPointerCapture(event.pointerId)) assembly.releasePointerCapture(event.pointerId);
    scheduleRender();
    if (!cancelled && tears.includes(tear) && tearReadyToOpen(tear)) openEnvelope(true);
  }

  assembly.addEventListener('pointerup', (event) => endPointer(event));
  assembly.addEventListener('pointercancel', (event) => endPointer(event, true));
  assembly.addEventListener('pointerleave', () => assembly.classList.remove('is-ready'));
  assembly.addEventListener('click', (event) => {
    if (event.detail === 0) openEnvelope();
  });
  assembly.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEnvelope();
    }
  });
  fallback.addEventListener('click', () => openEnvelope());

  document.getElementById('back-to-entry').addEventListener('click', () => {
    resetEnvelope();
    showStage('entry');
    input.focus({ preventScroll: true });
  });
  document.getElementById('replay-envelope').addEventListener('click', () => {
    resetEnvelope();
    showStage('envelope');
  });
  document.getElementById('change-recipient').addEventListener('click', () => {
    resetEnvelope();
    input.value = '';
    setGuest('');
    showStage('entry');
    input.focus({ preventScroll: true });
  });

  window.addEventListener('resize', () => {
    if (!stages.envelope.hidden) resizeBacking();
  });

  Promise.all([
    loadImage('face', 'assets/envelope-photo.webp'),
    loadImage('inner', 'assets/envelope-inner.svg?v=3'),
    loadImage('texture', 'assets/paper-texture.webp')
  ]).then(() => {
    imagesReady = true;
    buildPaper();
  });
  if (!imagesReady) buildPaper();
})();
