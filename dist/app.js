const productNodes = [...document.querySelectorAll('.menu-item[data-id]')];
const products = new Map(productNodes.map((node) => [node.dataset.id, {
  id: node.dataset.id,
  name: node.dataset.name,
  price: Number(node.dataset.price),
  image: node.dataset.image
}]));
const cartKey = 'malaysia-co-cart-v1';
const themeKey = 'malaysia-co-theme-v1';
const money = (amount) => `RM ${amount.toFixed(2)}`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(cartKey) || '{}');
    return new Map(Object.entries(saved).filter(([id, quantity]) =>
      products.has(id) && Number.isInteger(quantity) && quantity > 0 && quantity <= 99
    ));
  } catch {
    return new Map();
  }
}

let cart = loadCart();
let step = 'cart';
let customer = { name: '', email: '', note: '' };
let returnFocus = null;
const dialog = document.querySelector('#order-drawer');
const drawerBody = document.querySelector('#drawer-body');
const drawerFooter = document.querySelector('#drawer-footer');
const announcement = document.querySelector('#order-announcement');

function cartCount() { return [...cart.values()].reduce((sum, quantity) => sum + quantity, 0); }
function cartTotal() { return [...cart].reduce((sum, [id, quantity]) => sum + products.get(id).price * quantity, 0); }
function persistCart() {
  try { localStorage.setItem(cartKey, JSON.stringify(Object.fromEntries(cart))); } catch { /* browsing still works */ }
  const count = cartCount();
  document.querySelectorAll('.order-count').forEach((node) => { node.textContent = count; });
  document.querySelectorAll('.order-trigger').forEach((node) => { node.setAttribute('aria-label', `Open order, ${count} ${count === 1 ? 'item' : 'items'}`); });
}

function openOrder(trigger) {
  returnFocus = trigger || document.activeElement;
  step = 'cart';
  renderDrawer();
  if (!dialog.open) dialog.showModal();
  document.body.style.overflow = 'hidden';
}

function closeOrder() { if (dialog.open) dialog.close(); }
dialog.addEventListener('close', () => {
  document.body.style.overflow = '';
  if (step === 'confirmed') customer = { name: '', email: '', note: '' };
  step = 'cart';
  if (returnFocus?.isConnected) returnFocus.focus();
});
dialog.addEventListener('click', (event) => { if (event.target === dialog) closeOrder(); });
document.querySelector('[data-close-order]').addEventListener('click', closeOrder);
document.querySelectorAll('[data-open-order]').forEach((button) => button.addEventListener('click', () => openOrder(button)));

document.querySelectorAll('[data-add-item]').forEach((button) => button.addEventListener('click', () => {
  const product = products.get(button.closest('.menu-item').dataset.id);
  cart.set(product.id, Math.min(99, (cart.get(product.id) || 0) + 1));
  persistCart();
  announcement.textContent = `${product.name} added to your order.`;
  openOrder(button);
}));
document.querySelectorAll('[data-add-item]').forEach((button) => {
  const product = products.get(button.closest('.menu-item').dataset.id);
  button.setAttribute('aria-label', `Add ${product.name} to order`);
});

function cartLines() {
  return [...cart].map(([id, quantity]) => {
    const product = products.get(id);
    return `<article class="cart-line">
      <img src="${product.image}" width="72" height="82" alt="">
      <div class="cart-line-copy">
        <div class="cart-line-top"><h3>${escapeHtml(product.name)}</h3><span class="cart-line-price">${money(product.price * quantity)}</span></div>
        <div class="qty-row">
          <button class="qty-button" type="button" data-quantity="-1" data-id="${id}" aria-label="Decrease ${escapeHtml(product.name)} quantity">−</button>
          <span class="qty-value" aria-label="Quantity ${quantity}">${quantity}</span>
          <button class="qty-button" type="button" data-quantity="1" data-id="${id}" aria-label="Increase ${escapeHtml(product.name)} quantity">+</button>
          <button class="remove-button" type="button" data-remove="${id}">Remove</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function renderDrawer() {
  const title = document.querySelector('#drawer-title');
  if (step === 'cart') {
    title.textContent = 'Your order';
    if (cart.size === 0) {
      drawerBody.innerHTML = `<div class="empty-state"><h3>Start with something good.</h3><p>Explore the menu and add the pastries, breads or drinks you like.</p><button class="button button-accent" type="button" data-browse-menu>Explore the menu</button></div>`;
      drawerFooter.innerHTML = `<p class="drawer-note">This ordering flow is a demo. No order will be sent or charged.</p>`;
    } else {
      drawerBody.innerHTML = cartLines();
      drawerFooter.innerHTML = `<div class="drawer-total"><span>Total</span><strong>${money(cartTotal())}</strong></div><button class="primary-action" type="button" data-next="checkout">Continue to checkout</button><p class="drawer-note">Demo checkout. No order will be sent or charged.</p>`;
    }
  } else if (step === 'checkout') {
    title.textContent = 'Checkout';
    drawerBody.innerHTML = `<h3 class="checkout-heading">Your details</h3><p class="checkout-intro">Add contact details for the order preview. This demo does not submit them.</p>
      <form class="checkout-form" id="checkout-form">
        <label class="field-label">Name<input name="name" type="text" autocomplete="name" required maxlength="80" value="${escapeHtml(customer.name)}"></label>
        <label class="field-label">Email<input name="email" type="email" autocomplete="email" required maxlength="120" value="${escapeHtml(customer.email)}"></label>
        <label class="field-label">Order note, optional<textarea name="note" maxlength="300">${escapeHtml(customer.note)}</textarea></label>
      </form>`;
    drawerFooter.innerHTML = `<div class="drawer-total"><span>Total</span><strong>${money(cartTotal())}</strong></div><button class="primary-action" type="submit" form="checkout-form">Review order</button><button class="back-button" type="button" data-back="cart">Back to order</button>`;
    drawerBody.querySelector('input[name="name"]').focus();
  } else if (step === 'review') {
    title.textContent = 'Review order';
    drawerBody.innerHTML = `<h3 class="checkout-heading">One last look.</h3><p class="checkout-intro">Review the items and details in this demo order.</p>
      <div class="review-summary"><h3>${escapeHtml(customer.name)}</h3><p>${escapeHtml(customer.email)}</p>${customer.note ? `<p>${escapeHtml(customer.note)}</p>` : ''}</div>
      <div class="review-list">${[...cart].map(([id, quantity]) => { const product = products.get(id); return `<div class="review-line"><span>${quantity} × ${escapeHtml(product.name)}</span><span>${money(product.price * quantity)}</span></div>`; }).join('')}</div>`;
    drawerFooter.innerHTML = `<div class="drawer-total"><span>Total</span><strong>${money(cartTotal())}</strong></div><button class="primary-action" type="button" data-finish>Complete demo order</button><button class="back-button" type="button" data-back="checkout">Edit details</button><p class="drawer-note">No order will be sent or charged.</p>`;
  } else {
    title.textContent = 'Demo complete';
    drawerBody.innerHTML = `<div class="confirmation"><div class="confirmation-mark" aria-hidden="true">OK</div><h3>Order preview complete.</h3><p>Thanks, ${escapeHtml(customer.name)}. This was a demonstration. Your details were not submitted and no payment was taken.</p></div>`;
    drawerFooter.innerHTML = `<button class="primary-action" type="button" data-browse-menu>Back to the menu</button>`;
  }
}

dialog.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.quantity) {
    const id = button.dataset.id;
    const next = (cart.get(id) || 0) + Number(button.dataset.quantity);
    if (next > 0) cart.set(id, Math.min(99, next)); else cart.delete(id);
    persistCart(); renderDrawer();
  } else if (button.dataset.remove) {
    cart.delete(button.dataset.remove);
    persistCart(); renderDrawer();
  } else if (button.dataset.next === 'checkout') {
    step = 'checkout'; renderDrawer();
  } else if (button.dataset.back) {
    step = button.dataset.back; renderDrawer();
  } else if (button.hasAttribute('data-finish')) {
    step = 'confirmed'; cart.clear(); persistCart(); renderDrawer();
  } else if (button.hasAttribute('data-browse-menu')) {
    closeOrder();
    document.querySelector('#menu').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
});

dialog.addEventListener('submit', (event) => {
  if (event.target.id !== 'checkout-form') return;
  event.preventDefault();
  const data = new FormData(event.target);
  customer = { name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), note: String(data.get('note')).trim() };
  if (!customer.name || !customer.email) return;
  step = 'review'; renderDrawer();
});

const filterButtons = [...document.querySelectorAll('[data-filter]')];
filterButtons.forEach((button) => button.addEventListener('click', () => {
  const filter = button.dataset.filter;
  filterButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('.menu-category').forEach((category) => {
    category.hidden = filter !== 'all' && category.dataset.category !== filter;
  });
}));

const themeToggle = document.querySelector('.theme-toggle');
let storedTheme = null;
try { storedTheme = localStorage.getItem(themeKey); } catch { /* use system theme */ }
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  themeToggle.textContent = dark ? 'Light mode' : 'Dark mode';
  themeToggle.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
  themeToggle.setAttribute('aria-pressed', String(dark));
  document.querySelector('meta[name="theme-color"]').content = dark ? '#171c19' : '#e7e9e4';
}
applyTheme(storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(themeKey, next); } catch { /* preference remains for this visit */ }
});

if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('js-motion');
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
  }), { rootMargin: '0px 0px -8% 0px', threshold: .05 });
  document.querySelectorAll('.reveal').forEach((node) => observer.observe(node));
}

persistCart();
