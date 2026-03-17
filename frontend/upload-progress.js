// Upload Progress Overlay with Fun Messages
(function() {
    'use strict';

    const funMessages = [
        "📝 Техникът казва: „Не e развалено, така си работи“ - a системата казва „заявката e изпратена“.",
        "🏃‍♂️ Техникът тича, заявката пълзи.",
        "🧙‍♂️ Магията свърши, минаваме на резервни части.",
        "💾 Записва се! Дано не е като последния път...",
        "🧙‍♂️ Призоваваме магьосниците от поддръжката - c ключ 13, изолирбанд и WD-40.",
        "🎪 Правим цирк около машината, докато системата ти приема заявката...",
        "🌈 Обещаха, че частта идва „днеска–утре“ – значи някой ден...",
        "🎵 Машините дрънкат, компресорът свири, a ние бутаме заявката към одобрение.",
        "🚂 Поръчката тръгна – дали ще пристигне е друг филм.",
        "🔌 „Изключи, включи, моли се. Поръчката поне замина...",
        "🎯 Целим ce право в липсващата част, дано този път я има на склад...",
        "🤏 Само леко бръмчи, нищо й няма… поръчката все пак замина...",
        "🔩 Още една поръчка, още един шанс да не държим линията „на тел и молитва...",
        "🎲 Хвърляме зара - или идва част навреме, или пак „ще го оправим временно“.",
        "🔌 Изключи, включи, рестарт на машината - за щастие поръчката не иска рестарт.",

        
        // "🚀 Launching your order into cyberspace...",
       // "📦 Wrapping your request with care...",
       // "🎯 Taking aim at the procurement department...",
       // "🧙‍♂️ Summoning the order wizards...",
       // "☕ Brewing a fresh batch of requisitions...",
       // "🎪 Juggling bytes and paperwork...",
       // "🏃‍♂️ Running to the digital warehouse...",
       // "🎵 Composing a symphony of supply chain...",
       // "🍕 Delivering better than pizza (almost)...",
       // "🎲 Rolling for critical order success...",
       // "🌟 Making your dreams come true, one order at a time...",
       // "🦄 Riding unicorns to the approval queue...",
       // "🎨 Painting your order masterpiece...",
        //"🔮 Predicting 100% delivery success...",
       // "🎭 Performing order submission theater...",
        //"🚂 All aboard the procurement express...",
       // "🎪 Three rings of requisition circus...",
       // "🏗️ Building a monument to efficiency...",
       // "🎁 Gift-wrapping your request...",
       // "🌈 Riding rainbows to the database..."    
        
    ];

    function createProgressOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'uploadProgressOverlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(2, 6, 23, 0.95);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            animation: fadeIn 0.3s ease-out;
        `;

        const container = document.createElement('div');
        container.style.cssText = `
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95));
            padding: 2.5rem 3rem;
            border-radius: 16px;
            border: 1px solid rgba(148, 163, 184, 0.3);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            min-width: 420px;
            max-width: 500px;
        `;

        const messageEl = document.createElement('div');
        messageEl.id = 'uploadMessage';
        messageEl.style.cssText = `
            font-size: 1.1rem;
            color: #f1f5f9;
            margin-bottom: 1.5rem;
            text-align: center;
            font-weight: 500;
            min-height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        messageEl.textContent = getRandomMessage();

        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = `
            background: rgba(15, 23, 42, 0.8);
            border-radius: 12px;
            padding: 4px;
            margin-bottom: 1rem;
            border: 1px solid rgba(71, 85, 105, 0.4);
        `;

        const progressBar = document.createElement('div');
        progressBar.id = 'uploadProgressBar';
        progressBar.style.cssText = `
            height: 24px;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6);
            border-radius: 8px;
            width: 0%;
            transition: width 0.3s ease-out;
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
        `;

        const percentEl = document.createElement('div');
        percentEl.id = 'uploadPercent';
        percentEl.style.cssText = `
            text-align: center;
            font-size: 0.95rem;
            color: #cbd5e1;
            font-weight: 600;
            margin-top: 0.5rem;
        `;
        percentEl.textContent = '0%';

        progressContainer.appendChild(progressBar);
        container.appendChild(messageEl);
        container.appendChild(progressContainer);
        container.appendChild(percentEl);
        overlay.appendChild(container);

        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);

        return overlay;
    }

    function getRandomMessage() {
        return funMessages[Math.floor(Math.random() * funMessages.length)];
    }

    function updateProgress(percent) {
        const progressBar = document.getElementById('uploadProgressBar');
        const percentEl = document.getElementById('uploadPercent');
        const messageEl = document.getElementById('uploadMessage');

        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
        if (percentEl) {
            percentEl.textContent = `${Math.round(percent)}%`;
        }

        // Change message at milestones
        if (messageEl && (percent === 25 || percent === 50 || percent === 75)) {
            messageEl.style.opacity = '0';
            setTimeout(() => {
                messageEl.textContent = getRandomMessage();
                messageEl.style.opacity = '1';
            }, 200);
            messageEl.style.transition = 'opacity 0.2s ease-in-out';
        }
    }

    function showProgressOverlay() {
        const existing = document.getElementById('uploadProgressOverlay');
        if (existing) {
            existing.remove();
        }
        document.body.appendChild(createProgressOverlay());
    }

    function hideProgressOverlay() {
        const overlay = document.getElementById('uploadProgressOverlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => overlay.remove(), 300);
        }
    }

    // Export functions to global scope
    window.UploadProgress = {
        show: showProgressOverlay,
        hide: hideProgressOverlay,
        update: updateProgress
    };
})();
