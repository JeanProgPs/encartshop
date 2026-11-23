import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Testes do Botão de Compartilhar Produto e Deep Link', async (t) => {
  const rootDir = process.cwd();
  const renderJs = fs.readFileSync(path.join(rootDir, 'js/ui/render.js'), 'utf8');
  const productsJs = fs.readFileSync(path.join(rootDir, 'loja/modules/products.js'), 'utf8');
  const galleryJs = fs.readFileSync(path.join(rootDir, 'loja/modules/gallery.js'), 'utf8');
  const modernCss = fs.readFileSync(path.join(rootDir, 'css/store-modern.css'), 'utf8');

  await t.test('1. Renderização do Card de Produto inclui botão de compartilhar', () => {
    assert.ok(renderJs.includes('btn-share-product'), 'Deve incluir a classe btn-share-product no card');
    assert.ok(renderJs.includes('window.shareProduct'), 'Deve invocar window.shareProduct no onclick');
    assert.ok(renderJs.includes('event.stopPropagation()'), 'Deve parar propagação para não abrir galeria ao clicar no botão');
  });

  await t.test('2. Módulo de Produtos expõe shareProduct e suporte a Deep Link', () => {
    assert.ok(productsJs.includes('async function shareProduct'), 'Deve implementar a função shareProduct');
    assert.ok(productsJs.includes('navigator.share'), 'Deve usar Web Share API quando suportado');
    assert.ok(productsJs.includes('navigator.clipboard'), 'Deve ter fallback para cópia na área de transferência');
    assert.ok(productsJs.includes('window.shareProduct = shareProduct'), 'Deve exportar para window.shareProduct');
    assert.ok(productsJs.includes('_checkDeepLinkProduct()'), 'Deve checar deep link de produto (?p= ou ?produto=)');
    assert.ok(productsJs.includes('highlight-product'), 'Deve adicionar classe de animação e scroll suave');
  });

  await t.test('3. Modal da Galeria possui botão de compartilhamento e proteção de clique', () => {
    assert.ok(galleryJs.includes('gallery-share-btn'), 'Galeria deve possuir botão gallery-share-btn');
    assert.ok(galleryJs.includes("if (e.target.closest('.btn-share-product')) return;"), 'Galeria deve ignorar clique no botão de share da imagem');
  });

  await t.test('4. CSS define posições, animação de pulso e responsividade', () => {
    assert.ok(modernCss.includes('.btn-share-product'), 'CSS deve definir classe .btn-share-product');
    assert.ok(modernCss.includes('@keyframes productHighlightGlow'), 'CSS deve conter animação de brilho para deep link');
    assert.ok(modernCss.includes('.product-card.highlight-product'), 'CSS deve conter classe .product-card.highlight-product');
    assert.ok(modernCss.includes('.promo-badge'), 'Badge de promoção deve ter posição ajustada para não sobrepor');
  });
});
