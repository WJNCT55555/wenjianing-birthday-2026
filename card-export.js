(() => {
  'use strict';

  const saveButton = document.getElementById('save-card');
  const preview = document.getElementById('save-preview');
  const previewImage = document.getElementById('save-preview-image');
  const downloadLink = document.getElementById('save-preview-download');
  const closeButton = document.getElementById('close-save-preview');
  const qrImage = document.querySelector('.invite-qr-image');
  const W = 1200;
  const H = 1600;
  const ink = '#0b0b0c';
  const cream = '#f3eee5';
  const muted = '#bcb2a8';
  const lineColor = '#625a53';
  const red = '#ad2531';
  const sans = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
  const serif = '"SimSun", "Songti SC", "Noto Serif CJK SC", serif';
  let currentImageUrl = '';

  function rule(ctx, y, x1 = 91, x2 = 1109, color = lineColor, width = 2) {
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function text(ctx, value, x, y, size, color = cream, weight = 700, family = sans) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillText(value, x, y);
  }

  function fitName(ctx, value) {
    const characters = Array.from(value);
    const largest = characters.length > 8 ? 58 : 70;
    for (let size = largest; size >= 40; size -= 2) {
      ctx.font = `900 ${size}px ${sans}`;
      if (ctx.measureText(value).width <= 800) return { lines: [value], size };
    }
    for (let size = 52; size >= 34; size -= 2) {
      ctx.font = `900 ${size}px ${sans}`;
      const middle = Math.ceil(characters.length / 2);
      const lines = [characters.slice(0, middle).join(''), characters.slice(middle).join('')];
      if (lines.every((line) => ctx.measureText(line).width <= 800)) return { lines, size };
    }
    return { lines: [value], size: 34 };
  }

  function renderCard() {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#8d847a';
    ctx.lineWidth = 2;
    ctx.strokeRect(51, 46, 1098, 1508);
    ctx.fillStyle = red;
    ctx.fillRect(51, 46, 11, 1508);

    text(ctx, 'ПРИГЛАШЕНИЕ', 91, 111, 26, cream, 700, 'Arial, sans-serif');
    text(ctx, '私人邀请', 984, 111, 25, cream, 700);
    rule(ctx, 137);

    // One flat, interrupted red sun is the only large graphic mark.
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.arc(898, 394, 207, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(898, 394, 112, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(898, 394);
    ctx.rotate(-.50);
    ctx.fillRect(-300, -25, 600, 50);
    ctx.restore();

    text(ctx, '下一幕，', 91, 340, 145, cream, 900);
    text(ctx, '见你。', 91, 493, 145, cream, 900);
    rule(ctx, 565);
    text(ctx, '致 / TO', 91, 642, 28, '#d44951', 800);
    const name = document.getElementById('card-name').textContent.trim() || '朋友';
    const fitted = fitName(ctx, name);
    const baseline = fitted.lines.length === 1 ? [655] : [626, 688];
    fitted.lines.forEach((part, index) => text(ctx, part, 245, baseline[index], fitted.size, cream, 900));
    rule(ctx, 711);

    text(ctx, '温家宁的生日之夜，', 91, 779, 39, muted, 500, serif);
    text(ctx, '想与你一起度过。', 91, 830, 39, muted, 500, serif);
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.moveTo(91, 866);
    ctx.lineTo(188, 866);
    ctx.lineTo(174, 875);
    ctx.lineTo(91, 875);
    ctx.fill();
    rule(ctx, 899);

    text(ctx, '日期', 91, 974, 27, muted, 700);
    text(ctx, '11 / 05', 248, 1041, 119, cream, 900, 'Arial, sans-serif');
    text(ctx, '2026 · 预计', 788, 1016, 30, muted, 700);
    rule(ctx, 1080);
    text(ctx, '时间', 91, 1150, 27, muted, 700);
    text(ctx, '晚间', 212, 1154, 54, cream, 800);
    text(ctx, '地点', 630, 1150, 27, muted, 700);
    text(ctx, '待公布', 750, 1154, 54, cream, 800);
    rule(ctx, 1194);

    text(ctx, '期待见到你，', 91, 1298, 30, muted, 500, serif);
    text(ctx, '温家宁', 91, 1378, 72, cream, 800, serif);
    text(ctx, '扫码，打开这一幕。', 91, 1468, 28, cream, 800);
    text(ctx, 'WEN JIANING  ·  2026', 91, 1516, 21, muted, 700, 'Arial, sans-serif');
    ctx.fillStyle = cream;
    ctx.fillRect(845, 1247, 260, 260);
    if (qrImage.complete && qrImage.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qrImage, 845, 1247, 260, 260);
      ctx.imageSmoothingEnabled = true;
    } else {
      throw new Error('二维码尚未加载，请稍后重试。');
    }
    return { canvas, name };
  }

  function closePreview() {
    preview.hidden = true;
    saveButton.focus({ preventScroll: true });
  }

  saveButton.addEventListener('click', () => {
    try {
      const { canvas, name } = renderCard();
      const data = canvas.toDataURL('image/png');
      const binary = atob(data.slice(data.indexOf(',') + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const imageUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
      currentImageUrl = imageUrl;
      const filename = `温家宁生日邀请函-${name.replace(/[\\/:*?"<>|]/g, '')}.png`;
      previewImage.src = imageUrl;
      downloadLink.href = imageUrl;
      downloadLink.download = filename;
      preview.hidden = false;
      closeButton.focus({ preventScroll: true });
      const download = document.createElement('a');
      download.href = imageUrl;
      download.download = filename;
      document.body.appendChild(download);
      download.click();
      download.remove();
    } catch (error) {
      saveButton.textContent = error.message || '生成失败，请稍后重试';
      window.setTimeout(() => { saveButton.innerHTML = '保存专属卡片 <span aria-hidden="true">↓</span>'; }, 2500);
    }
  });
  closeButton.addEventListener('click', closePreview);
  preview.addEventListener('click', (event) => { if (event.target === preview) closePreview(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !preview.hidden) closePreview();
  });
})();
