/* Cateringpaket – step form on the product page */
(function () {
    const CFG = window.CateringpaketConfig || {};
    const PRICE = Number(CFG.price) || 0;
    const MIN = Math.max(1, parseInt(CFG.min, 10) || 1);
    const fmt = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const SKIP = ['hidden', 'submit', 'button', 'checkbox', 'radio'];

    const ICON_MINUS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
    const ICON_PLUS  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>';

    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = v => parseInt(v, 10) || 0;

    function fieldInputs(form, qty) {
        return [...form.querySelectorAll('input')].filter(i => i !== qty && !SKIP.includes(i.type) && !i.closest('.up-package'));
    }

    function labelText(input) {
        let t = '';
        if (input.id) {
            const l = document.querySelector('label[for="' + CSS.escape(input.id) + '"]');
            if (l) t = l.textContent;
        }
        if (!t && input.closest('label')) t = input.closest('label').textContent;
        let el = input.parentElement;
        for (let i = 0; !t && i < 4 && el; i++) {
            const l = el.querySelector('label');
            if (l) t = l.textContent;
            el = el.parentElement;
        }
        if (!t) t = input.getAttribute('aria-label') || input.placeholder || input.name || '';
        return t.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
    }

    // Reads the fields in the order they appear in Product input fields.
    // A Paragraph field (no input) starts a new group and becomes its heading,
    // the Number fields below it become the group's options.
    function buildGroups(container, inputs, skip) {
        const groups = [];
        let current = null;
        const startGroup = title => { current = { title, items: [] }; groups.push(current); };
        (function walk(el) {
            [...el.children].forEach(child => {
                const inside = inputs.filter(i => child === i || child.contains(i));
                if (inside.length === 0) {
                    if (/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(child.tagName) || skip(child)) return;
                    const text = child.textContent.replace(/\s+/g, ' ').trim();
                    if (text) startGroup(text);
                } else if (inside.length === 1) {
                    if (!current) startGroup('');
                    current.items.push({ input: inside[0], name: labelText(inside[0]) });
                } else {
                    walk(child);
                }
            });
        })(container);
        return groups.filter(g => g.items.length);
    }

    // Dispatch events so the add-ons plugin and the theme notice the change
    function setValue(input, value) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Hide the original fields (they stay in the form and are submitted as usual)
    function hideOriginals(form, inputs, qtyInput, button) {
        const blocks = el => el.contains(qtyInput) || (button && el.contains(button));
        let box = inputs[0].parentElement;
        while (box && box !== form && !inputs.every(i => box.contains(i))) box = box.parentElement;
        if (box && box !== form && !blocks(box)) {
            box.classList.add('up-hidden');
        } else {
            inputs.forEach(input => {
                let w = input;
                while (w.parentElement && w.parentElement !== form && !blocks(w.parentElement)
                    && fieldInputs(form, qtyInput).filter(i => w.parentElement.contains(i)).length === 1) {
                    w = w.parentElement;
                }
                w.classList.add('up-hidden');
            });
        }
        const qtyWrap = qtyInput.closest('.quantity') || qtyInput;
        if (!button || !qtyWrap.contains(button)) qtyWrap.classList.add('up-hidden');
    }

    function init(attempt) {
        const forms = [...document.querySelectorAll('form.cart')];
        let form = null, qtyInput = null;
        for (const f of forms) {
            const q = f.querySelector('input.qty, input[name="quantity"]');
            if (fieldInputs(f, q).length) { form = f; qtyInput = q; break; }
        }
        if (!form) {
            if (attempt < 10) setTimeout(() => init(attempt + 1), 500);
            return;
        }
        if (!qtyInput || form.querySelector('.up-package')) return;

        const button = form.querySelector('.single_add_to_cart_button, button[type="submit"]');
        const inputs = fieldInputs(form, qtyInput);
        let container = inputs[0].parentElement;
        while (container && container !== form && !inputs.every(i => container.contains(i))) container = container.parentElement;
        const skip = el => el.contains(qtyInput) || (button && el.contains(button)) || el.classList.contains('package-qty-heading');
        const groups = buildGroups(container || form, inputs, skip);
        if (!groups.length) return;

        inputs.forEach(input => { input.min = 0; input.step = 1; });

        // Build the UI
        const ui = document.createElement('div');
        ui.className = 'up-package';
        let html =
            '<section class="up-step">' +
              '<div class="up-head"><span class="up-num">1</span><label for="up-people" class="up-title">Hur många är ni?</label></div>' +
              '<div class="up-row">' +
                '<div class="up-qty">' +
                  '<button type="button" class="up-qbtn" data-people="-1" aria-label="Färre personer">' + ICON_MINUS + '</button>' +
                  '<input id="up-people" type="number" min="' + MIN + '" step="1" inputmode="numeric">' +
                  '<button type="button" class="up-qbtn" data-people="1" aria-label="Fler personer">' + ICON_PLUS + '</button>' +
                '</div>' +
                '<span class="up-muted">Minst ' + MIN + ' personer</span>' +
              '</div>' +
            '</section>';

        let step = 2;
        groups.forEach((g, gi) => {
            if (!g.items.length) return;
            html += '<section class="up-step">' +
                '<div class="up-head"><span class="up-num">' + (step++) + '</span><h3 class="up-title">' + esc(g.title) + '</h3><span class="up-badge" data-badge="' + gi + '" aria-live="polite"></span></div>' +
                '<div class="up-grid">' +
                g.items.map((it, ii) =>
                    '<div class="up-card" data-card="' + gi + '-' + ii + '">' +
                      '<span class="up-name">' + esc(it.name) + '</span>' +
                      '<div class="up-stepper">' +
                        '<button type="button" class="up-btn" data-g="' + gi + '" data-i="' + ii + '" data-d="-1" aria-label="Ta bort en ' + esc(it.name) + '">' + ICON_MINUS + '</button>' +
                        '<span class="up-count">0</span>' +
                        '<button type="button" class="up-btn" data-g="' + gi + '" data-i="' + ii + '" data-d="1" aria-label="Lägg till en ' + esc(it.name) + '">' + ICON_PLUS + '</button>' +
                      '</div>' +
                    '</div>'
                ).join('') +
                '</div></section>';
        });

        html += '<div class="up-summary">' +
                  '<span class="up-muted" data-calc></span>' +
                  '<span>Totalt <span class="up-sum" data-sum></span> inkl. moms</span>' +
                '</div>';
        ui.innerHTML = html;

        hideOriginals(form, inputs, qtyInput, button);
        form.classList.add('up-js');
        if (button) button.insertAdjacentElement('beforebegin', ui);
        else form.appendChild(ui);

        const peopleInput = ui.querySelector('#up-people');
        const people = () => Math.max(MIN, num(qtyInput.value));

        function setPeople(n) {
            setValue(qtyInput, Math.max(MIN, n));
            update();
        }

        function update() {
            const total = people();
            if (document.activeElement !== peopleInput) peopleInput.value = total;
            ui.querySelector('[data-people="-1"]').disabled = total <= MIN;
            ui.querySelector('[data-calc]').textContent = total + ' personer × ' + fmt.format(PRICE);
            ui.querySelector('[data-sum]').textContent = fmt.format(total * PRICE);

            let allOk = true;
            groups.forEach((g, gi) => {
                if (!g.items.length) return;
                const sum = g.items.reduce((s, it) => s + num(it.input.value), 0);
                const left = total - sum;
                const badge = ui.querySelector('[data-badge="' + gi + '"]');
                if (left > 0) {
                    badge.textContent = sum + ' av ' + total + ' valda · ' + left + ' kvar';
                    badge.className = 'up-badge up-badge--remaining'; allOk = false;
                } else if (left < 0) {
                    badge.textContent = (-left) + ' för många – ta bort ' + (-left);
                    badge.className = 'up-badge up-badge--over'; allOk = false;
                } else {
                    badge.textContent = sum + ' av ' + total + ' valda';
                    badge.className = 'up-badge up-badge--done';
                }
                g.items.forEach((it, ii) => {
                    const c = num(it.input.value);
                    const card = ui.querySelector('[data-card="' + gi + '-' + ii + '"]');
                    card.classList.toggle('is-active', c > 0);
                    card.querySelector('.up-count').textContent = c;
                    card.querySelector('[data-d="-1"]').disabled = c === 0;
                    card.querySelector('[data-d="1"]').disabled = left <= 0;
                });
            });
            if (button) {
                button.disabled = !allOk;
                button.setAttribute('aria-disabled', String(!allOk));
            }
        }

        ui.addEventListener('click', e => {
            const pb = e.target.closest('[data-people]');
            if (pb) { setPeople(people() + num(pb.dataset.people)); return; }
            const b = e.target.closest('.up-btn');
            if (!b || b.disabled) return;
            const it = groups[num(b.dataset.g)].items[num(b.dataset.i)];
            const next = Math.max(0, num(it.input.value) + num(b.dataset.d));
            setValue(it.input, next === 0 ? '' : next);
            update();
        });

        peopleInput.addEventListener('input', () => {
            const v = num(peopleInput.value);
            if (v >= MIN) setPeople(v);
        });
        peopleInput.addEventListener('change', () => {
            setPeople(num(peopleInput.value));
            peopleInput.value = people();
        });

        form.addEventListener('submit', e => { if (button && button.disabled) e.preventDefault(); });
        update();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init(1));
    } else {
        init(1);
    }
})();
