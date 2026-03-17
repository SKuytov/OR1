// frontend/quote-send.js
// PartPulse Smart Quote Send Panel
// Version 1.0.0 — Single-file, vanilla JS, no imports

(function () {
    'use strict';

    // ─── State ───────────────────────────────────────────────────────────────
    let _quoteData = null;   // { quote, sendLog }
    let _emailLang = 'bg';   // 'bg' | 'en'
    let _lastAction = null;  // 'outlook' | 'copy' | 'link' — tracks what was used

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Open the Send Panel for a given quote.
     * Called after quote creation OR from the "📧 Send Email" button.
     */
    window.openQuoteSendPanel = async function (quoteId) {
        ensurePanelExists();
        const panel = document.getElementById('quoteSendPanel');
        panel.classList.add('loading');
        panel.classList.remove('hidden');
        panel.classList.add('open');

        try {
            const res = await _apiGet(`/quotes/${quoteId}/email-data`);
            if (!res.success) { alert('Неуспешно зареждане на данните за офертата.'); return; }
            _quoteData = res;
            _emailLang = 'bg';
            _lastAction = null;
            renderQuoteSendPanel(res.quote, res.sendLog);
        } catch (err) {
            console.error('openQuoteSendPanel error:', err);
            panel.innerHTML = '<div style="padding:2rem;color:#ef4444;">Грешка при зареждане. Затворете и опитайте отново.</div>';
        } finally {
            panel.classList.remove('loading');
        }
    };

    window.closeQuoteSendPanel = function () {
        const panel = document.getElementById('quoteSendPanel');
        if (panel) {
            panel.classList.remove('open');
            setTimeout(() => panel.classList.add('hidden'), 300);
        }
    };

    window.setEmailLang = function (lang) {
        _emailLang = lang;
        document.getElementById('btnLangBg').classList.toggle('active', lang === 'bg');
        document.getElementById('btnLangEn').classList.toggle('active', lang === 'en');
        if (_quoteData) {
            document.getElementById('qsEmailPreview').textContent =
                generateEmailBody(_quoteData.quote, lang);
        }
    };

    window.doSendAction = function (method) {
        if (!_quoteData) return;
        const supplierEmail = document.getElementById('qsSupplierEmail').value.trim();
        const notes = document.getElementById('qsNotes').value.trim();
        const emailBody = generateEmailBody(_quoteData.quote, _emailLang, notes);

        if (method === 'outlook') {
            const subject = generateEmailSubject(_quoteData.quote, _emailLang);
            const mailtoLink = buildMailtoLink(supplierEmail, subject, emailBody);
            // Use window.open for long links to avoid browser truncation
            if (mailtoLink.length > 2000) {
                window.open(mailtoLink, '_blank');
            } else {
                window.location.href = mailtoLink;
            }
        } else if (method === 'copy') {
            copyToClipboard(emailBody, 'btnCopyText', 'Текстът е копиран!');
        } else if (method === 'link') {
            const subject = generateEmailSubject(_quoteData.quote, _emailLang);
            const link = buildMailtoLink(supplierEmail, subject, emailBody);
            copyToClipboard(link, 'btnCopyLink', 'Линкът е копиран!');
        }

        _lastAction = method;
        // Enable "Mark as Sent" button
        const btn = document.getElementById('btnMarkAsSent');
        if (btn) { btn.disabled = false; btn.classList.add('enabled'); }
    };

    window.handleMarkAsSent = async function () {
        if (!_quoteData || !_lastAction) return;
        const btn = document.getElementById('btnMarkAsSent');
        if (btn) { btn.disabled = true; btn.textContent = 'Записва се...'; }

        const supplierEmail = document.getElementById('qsSupplierEmail').value.trim();
        const notes = document.getElementById('qsNotes').value.trim();

        try {
            const res = await _apiPost(`/quotes/${_quoteData.quote.id}/send-log`, {
                method: _lastAction,
                supplier_email: supplierEmail,
                notes: notes
            });

            if (res.success) {
                _quoteData.sendLog = res.sendLog;
                _quoteData.quote = { ..._quoteData.quote, ...res.quote };
                renderSendHistory(res.sendLog);
                updateSendStatusBadge(true);

                // Update the quotes table row in main app if it exists
                if (typeof loadQuotes === 'function') loadQuotes();

                if (btn) { btn.textContent = '✓ Отбелязано!'; btn.classList.add('marked'); }
            } else {
                alert('Грешка: ' + (res.message || 'Неизвестна грешка'));
                if (btn) { btn.disabled = false; btn.textContent = '✓ Отбележи като изпратено'; }
            }
        } catch (err) {
            console.error('handleMarkAsSent error:', err);
            alert('Мрежова грешка. Опитайте отново.');
            if (btn) { btn.disabled = false; btn.textContent = '✓ Отбележи като изпратено'; }
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    function renderQuoteSendPanel(quote, sendLog) {
        const panel = document.getElementById('quoteSendPanel');
        const isSent = sendLog && sendLog.length > 0;
        const emailBody = generateEmailBody(quote, _emailLang);
        const supplierEmail = quote.supplier_email || '';

        panel.innerHTML = `
            <div class="qs-header">
                <div class="qs-header-left">
                    <span class="qs-icon">📧</span>
                    <h3>Изпращане на запитване за оферта</h3>
                </div>
                <button class="qs-close-btn" onclick="closeQuoteSendPanel()" title="Затвори">✕</button>
            </div>

            <div class="qs-summary">
                <span class="qs-quote-number">${escapeHtml(quote.quote_number)}</span>
                <span class="qs-supplier">${escapeHtml(quote.supplier_name || '—')}</span>
                <span class="qs-item-count">${(quote.items || []).length} артикула</span>
                <span class="qs-status-badge ${isSent ? 'sent' : ''}" id="qsStatusBadge">
                    ${isSent ? '✓ Изпратено' : '● Не е изпратено'}
                </span>
            </div>

            <div class="qs-items-section">
                <div class="qs-section-label">Артикули в офертата</div>
                <div class="qs-table-wrap">
                    <table class="qs-items-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Описание</th>
                                <th>Парт №</th>
                                <th>Кол.</th>
                                <th>Цех</th>
                                <th>До дата</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(quote.items || []).map((it, i) => `
                                <tr>
                                    <td class="qs-row-num">${i + 1}</td>
                                    <td class="qs-desc" title="${escapeHtml(it.item_description)}">${escapeHtml(truncate(it.item_description, 35))}</td>
                                    <td class="qs-part">${escapeHtml(it.part_number || '—')}</td>
                                    <td class="qs-qty">${it.quantity}</td>
                                    <td class="qs-building">${escapeHtml(it.building || '—')}</td>
                                    <td class="qs-date">${it.date_needed ? formatQsDate(it.date_needed) : '—'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="qs-email-field">
                <label class="qs-label" for="qsSupplierEmail">📬 Email на доставчик</label>
                <input type="email" id="qsSupplierEmail" class="qs-input"
                    placeholder="supplier@company.com"
                    value="${escapeHtml(supplierEmail)}"
                    oninput="window._qsUpdateMailto && window._qsUpdateMailto()">
            </div>

            <div class="qs-lang-bar">
                <span class="qs-label">Език на имейл:</span>
                <div class="qs-lang-btns">
                    <button id="btnLangBg" class="qs-lang-btn active" onclick="setEmailLang('bg')">🇧🇬 БГ</button>
                    <button id="btnLangEn" class="qs-lang-btn" onclick="setEmailLang('en')">🇬🇧 EN</button>
                </div>
            </div>

            <div class="qs-preview-box">
                <div class="qs-preview-label">Преглед на имейл:</div>
                <pre id="qsEmailPreview" class="qs-preview-text">${escapeHtml(emailBody)}</pre>
            </div>

            <div class="qs-send-options">
                <button class="qs-action-btn qs-primary" id="btnOpenOutlook" onclick="doSendAction('outlook')">
                    <span class="qs-btn-icon">📧</span>
                    <span class="qs-btn-label">Отвори в Outlook</span>
                    <span class="qs-btn-sub">Изпрати директно</span>
                </button>
                <button class="qs-action-btn qs-secondary" id="btnCopyText" onclick="doSendAction('copy')">
                    <span class="qs-btn-icon">📋</span>
                    <span class="qs-btn-label">Копирай текст</span>
                    <span class="qs-btn-sub">За поставяне в имейл</span>
                </button>
                <button class="qs-action-btn qs-tertiary" id="btnCopyLink" onclick="doSendAction('link')">
                    <span class="qs-btn-icon">🔗</span>
                    <span class="qs-btn-label">Копирай mailto:</span>
                    <span class="qs-btn-sub">Копирай линка</span>
                </button>
            </div>

            <div class="qs-notes-field">
                <label class="qs-label" for="qsNotes">Допълнителни бележки <span class="qs-optional">(по избор)</span></label>
                <textarea id="qsNotes" class="qs-textarea" rows="2"
                    placeholder="Допълнителни инструкции за доставчика..."></textarea>
            </div>

            <button id="btnMarkAsSent" class="qs-mark-sent-btn" disabled onclick="handleMarkAsSent()">
                ✓ Отбележи като изпратено
            </button>

            <div id="qsSendHistory" class="qs-history">
                ${renderSendHistoryHtml(sendLog)}
            </div>
        `;
    }

    function renderSendHistory(sendLog) {
        const el = document.getElementById('qsSendHistory');
        if (el) el.innerHTML = renderSendHistoryHtml(sendLog);
    }

    function renderSendHistoryHtml(sendLog) {
        if (!sendLog || !sendLog.length) {
            return '<div class="qs-history-empty">Все още не е изпратено.</div>';
        }
        const methodIcons = { outlook: '📧', copy: '📋', link: '🔗' };
        const methodLabels = { outlook: 'Outlook', copy: 'Копиране на текст', link: 'Копиране на mailto' };
        return `
            <div class="qs-history-title">История на изпращанията</div>
            <ul class="qs-history-list">
                ${sendLog.map(entry => `
                    <li class="qs-history-item">
                        <span class="qs-history-icon">${methodIcons[entry.method] || '📧'}</span>
                        <div class="qs-history-details">
                            <span class="qs-history-method">${methodLabels[entry.method] || entry.method}</span>
                            <span class="qs-history-meta">
                                ${formatQsDateTime(entry.sent_at)} · ${escapeHtml(entry.sent_by_name || '—')}
                                ${entry.supplier_email ? `· <span class="qs-history-email">${escapeHtml(entry.supplier_email)}</span>` : ''}
                            </span>
                            ${entry.notes ? `<span class="qs-history-notes">${escapeHtml(entry.notes)}</span>` : ''}
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    function updateSendStatusBadge(isSent) {
        const badge = document.getElementById('qsStatusBadge');
        if (!badge) return;
        if (isSent) {
            badge.className = 'qs-status-badge sent';
            badge.textContent = '✓ Изпратено';
        } else {
            badge.className = 'qs-status-badge';
            badge.textContent = '● Не е изпратено';
        }
    }

    // ─── Email Generation ─────────────────────────────────────────────────────

    function generateEmailSubject(quote, lang) {
        if (lang === 'en') {
            return `Quote Request: ${quote.quote_number}`;
        }
        return `Запитване за оферта: ${quote.quote_number}`;
    }

    function generateEmailBody(quote, lang, extraNotes) {
        const items = quote.items || [];
        const earliestDate = items
            .map(it => it.date_needed)
            .filter(Boolean)
            .sort()[0];

        if (lang === 'en') {
            return generateEmailBodyEn(quote, items, earliestDate, extraNotes);
        }
        return generateEmailBodyBg(quote, items, earliestDate, extraNotes);
    }

    function generateEmailBodyBg(quote, items, earliestDate, extraNotes) {
        const dateStr = new Date().toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const neededStr = earliestDate ? formatQsDate(earliestDate) : '—';
        const contactPerson = quote.supplier_contact || quote.supplier_name || 'Уважаеми партньор';

        const separator = '═'.repeat(55);
        const lineSep = '─'.repeat(70);

        let itemsText = '';
        items.forEach((it, i) => {
            const num = String(i + 1).padEnd(3);
            const desc = truncate(it.item_description || '', 28).padEnd(29);
            const part = truncate(it.part_number || '—', 12).padEnd(13);
            const qty = String(it.quantity).padStart(5);
            const building = truncate(it.building || '—', 6).padEnd(6);
            itemsText += `${num}| ${desc}| ${part}| ${qty} | ${building}\n`;
        });

        let body = `До: ${contactPerson},\n\nИзпращаме Ви запитване за оферта за следните материали:\n\n${separator}\nЗАПИТВАНЕ ЗА ОФЕРТА: ${quote.quote_number}\n${separator}\nДата: ${dateStr}\nНеобходима доставка до: ${neededStr}\n\nАРТИКУЛИ:\n${lineSep}\n№  | Описание                      | Парт №        |  Кол. | Цех\n${lineSep}\n${itemsText}${lineSep}\n\nМоля, потвърдете наличност, цена и срок на доставка.`;

        if (extraNotes) {
            body += `\n\nДопълнителна информация:\n${extraNotes}`;
        }

        body += `\n\nС уважение,\nОтдел Снабдяване — Septona`;

        return body;
    }

    function generateEmailBodyEn(quote, items, earliestDate, extraNotes) {
        const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const neededStr = earliestDate ? formatQsDate(earliestDate) : '—';
        const contactPerson = quote.supplier_contact || quote.supplier_name || 'Dear Partner';

        const separator = '═'.repeat(55);
        const lineSep = '─'.repeat(70);

        let itemsText = '';
        items.forEach((it, i) => {
            const num = String(i + 1).padEnd(3);
            const desc = truncate(it.item_description || '', 28).padEnd(29);
            const part = truncate(it.part_number || '—', 12).padEnd(13);
            const qty = String(it.quantity).padStart(5);
            const building = truncate(it.building || '—', 6).padEnd(6);
            itemsText += `${num}| ${desc}| ${part}| ${qty} | ${building}\n`;
        });

        let body = `To: ${contactPerson},\n\nWe are sending you a request for quotation for the following materials:\n\n${separator}\nQUOTE REQUEST: ${quote.quote_number}\n${separator}\nDate: ${dateStr}\nRequired delivery by: ${neededStr}\n\nITEMS:\n${lineSep}\nNo | Description                   | Part No.      |   Qty | Dept\n${lineSep}\n${itemsText}${lineSep}\n\nPlease confirm availability, pricing, and delivery lead time.`;

        if (extraNotes) {
            body += `\n\nAdditional information:\n${extraNotes}`;
        }

        body += `\n\nBest regards,\nProcurement Department — Septona`;

        return body;
    }

    function buildMailtoLink(toEmail, subject, body) {
        const to = encodeURIComponent(toEmail || '');
        const sub = encodeURIComponent(subject);
        const bod = encodeURIComponent(body);
        return `mailto:${to}?subject=${sub}&body=${bod}`;
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    function copyToClipboard(text, btnId, successMsg) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                flashButton(btnId, successMsg);
            }).catch(() => {
                fallbackCopy(text, btnId, successMsg);
            });
        } else {
            fallbackCopy(text, btnId, successMsg);
        }
    }

    function fallbackCopy(text, btnId, successMsg) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try { document.execCommand('copy'); flashButton(btnId, successMsg); }
        catch (e) { alert('Копирането не е успешно. Моля маркирайте текста ръчно.'); }
        document.body.removeChild(ta);
    }

    function flashButton(btnId, msg) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const orig = btn.innerHTML;
        btn.innerHTML = `<span class="qs-btn-icon">✅</span><span class="qs-btn-label">${msg}</span>`;
        btn.classList.add('copied');
        setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2500);
    }

    function truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.slice(0, len - 1) + '…' : str;
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatQsDate(dateStr) {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch { return dateStr; }
    }

    function formatQsDateTime(dtStr) {
        if (!dtStr) return '—';
        try {
            const d = new Date(dtStr);
            return d.toLocaleString('bg-BG', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch { return dtStr; }
    }

    // ─── API helpers (fallback to global apiGet/apiPost from app.js) ──────────

    function _apiGet(path) {
        if (typeof apiGet === 'function') return apiGet(path);
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        return fetch('/api' + path, {
            headers: { 'Authorization': 'Bearer ' + token }
        }).then(r => r.json());
    }

    function _apiPost(path, body) {
        if (typeof apiPost === 'function') return apiPost(path, body);
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        return fetch('/api' + path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(body)
        }).then(r => r.json());
    }

    // ─── DOM setup ────────────────────────────────────────────────────────────

    function ensurePanelExists() {
        if (!document.getElementById('quoteSendPanel')) {
            const div = document.createElement('div');
            div.id = 'quoteSendPanel';
            div.className = 'quote-send-panel hidden';
            document.body.appendChild(div);
        }
    }

    // Close panel on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const panel = document.getElementById('quoteSendPanel');
            if (panel && panel.classList.contains('open')) {
                closeQuoteSendPanel();
            }
        }
    });

}());
