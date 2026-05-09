// 等待HTML文檔完全加載和解析
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---    
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const mainNav = document.getElementById('main-nav');
    const cartCountSpan = document.getElementById('cart-count');
    const cartIcon = document.getElementById('cart-icon');
    const cartModal = document.getElementById('cart-modal');
    const closeModalBtn = document.querySelector('.close-btn');
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalSpan = document.getElementById('cart-total');
    const contactForm = document.getElementById('contact-form');
    const navLoginLink = document.getElementById('nav-login-link');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const checkoutBtn = document.getElementById('checkout-btn');
    const backToTopBtn = document.getElementById('back-to-top-btn');

    // --- State Management ---
    // 從 localStorage 讀取購物車資料，如果沒有就初始化為空陣列
    let cart = JSON.parse(localStorage.getItem('shoppingCart')) || [];
    // 模擬使用者資料庫
    let users = JSON.parse(localStorage.getItem('users')) || [];


    // --- Event Listeners ---

    // 初始化頁面時，更新購物車和登入狀態
    updateCart();
    updateLoginStatus();
    renderBreadcrumbs();
    renderProducts();

    // Check if we are on the product detail page
    if (document.getElementById('product-detail-container')) {
        renderProductDetail();
    }

    // Hamburger menu toggle
    if (hamburgerMenu && mainNav) {
        hamburgerMenu.addEventListener('click', () => {
            hamburgerMenu.classList.toggle('active');
            mainNav.classList.toggle('nav-open');
        });
    }

    // Back to top button logic
    if (backToTopBtn) {
        window.addEventListener('scroll', () => {
            if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) {
                backToTopBtn.style.display = "block";
            } else {
                backToTopBtn.style.display = "none";
            }
        });

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({top: 0, behavior: 'smooth'});
        });
    }

    // 使用事件委派來處理動態生成的 "加入購物車" 按鈕
    document.body.addEventListener('click', (event) => {
        if (event.target.classList.contains('add-to-cart-btn')) {
                const button = event.target;
                // 從按鈕的 data-* 屬性獲取商品資訊 (新增了id)
                const id = button.dataset.id;
                const name = button.dataset.name;
                const price = parseFloat(button.dataset.price);
                
                addToCart({ id, name, price });
                showNotification(`${name} 已加入購物車`);
        }
    });

    // 點擊購物車圖示，打開 Modal (如果頁面上有購物車圖示)
    if (cartIcon) {
        cartIcon.addEventListener('click', (e) => {
            e.preventDefault(); // 防止 <a> 標籤的默認跳轉行為
            openCartModal();
        });
    }

    // 點擊 Modal 中的 '×' 按鈕，關閉 Modal
    closeModalBtn.addEventListener('click', closeCartModal);

    // 點擊 Modal 外部的灰色區域，關閉 Modal
    window.addEventListener('click', (event) => {
        if (event.target == cartModal) {
            closeCartModal();
        }
    });

    // 使用事件委派來處理購物車內 "移除" 按鈕的點擊
    // 以及新的 "數量增減" 按鈕
    cartItemsContainer.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('remove-item-btn')) {
            const id = target.dataset.id;
            removeFromCart(id);
        } else if (target.classList.contains('quantity-btn')) {
            const id = target.dataset.id;
            const change = parseInt(target.dataset.change, 10);
            changeQuantity(id, change);
        }
    });

    // 監聽 "前往結帳" 按鈕
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
            if (!isLoggedIn) {
                alert('請先登入會員再進行結帳！');
                window.location.href = 'login.html';
                return;
            }
            if (cart.length === 0) {
                alert('您的購物車是空的！');
                return;
            }

            // 處理結帳邏輯
            processCheckout();
            showNotification('結帳成功！感謝您的購買！');
            closeCartModal();
        });
    }

    // 如果聯絡表單存在於當前頁面，則為其添加提交事件
    if (contactForm) {
        contactForm.addEventListener('submit', (event) => {
            event.preventDefault(); // 防止表單的默認提交行為

            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const message = document.getElementById('message').value.trim();

            if (name === '' || email === '' || message === '') {
                alert('所有欄位都必須填寫！');
                return;
            }
            
            // 在真實世界中，這裡會將數據發送到伺服器
            showNotification('感謝您的訊息，我們會盡快與您聯繫！');
            contactForm.reset(); // 清空表單
        });
    }

    // 如果登入表單存在於當前頁面，則為其添加提交事件
    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();

            if (!email || !password) {
                alert('請輸入電子郵件和密碼。');
                return;
            }

            // 模擬從使用者資料庫驗證
            const user = users.find(u => u.email === email && u.password === password);

            if (user) {
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('userEmail', email);
                showNotification('登入成功！歡迎回來！');
                setTimeout(() => { window.location.href = 'index.html'; }, 1500);
            } else {
                alert('電子郵件或密碼錯誤。');
            }
        });
    }

    // 如果註冊表單存在於當前頁面，則為其添加提交事件
    if (registerForm) {
        registerForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            // --- 註冊防呆機制 (Fool-proof validation) ---
            // 1. 檢查密碼是否一致
            if (password !== confirmPassword) {
                alert('兩次輸入的密碼不一致！');
                return;
            }
            // 2. 檢查密碼長度
            if (password.length < 6) {
                alert('密碼長度至少需要6個字元。');
                return;
            }
            // 3. 檢查Email格式 (簡易)
            if (!/^\S+@\S+\.\S+$/.test(email)) {
                alert('請輸入有效的電子郵件格式。');
                return;
            }
            // 4. 檢查Email是否已被註冊
            if (users.some(u => u.email === email)) {
                alert('這個電子郵件已經被註冊了。');
                return;
            }

            // 模擬註冊成功
            users.push({ email, password });
            localStorage.setItem('users', JSON.stringify(users));

            showNotification('註冊成功！頁面將跳轉至登入頁...');
            setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        });
    }

    // 會員中心頁面邏輯
    if (document.getElementById('member-center-container')) {
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        if (!isLoggedIn) {
            // 如果未登入，強制跳轉到登入頁
            window.location.href = 'login.html';
        } else {
            // 渲染會員中心內容
            renderMemberCenter();

            // 登出按鈕事件
            const logoutBtn = document.getElementById('logout-btn');
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('userEmail');
                showNotification('您已成功登出。');
                setTimeout(() => { window.location.href = 'index.html'; }, 1500);
            });
        }
    }


    // --- Functions ---

    function renderBreadcrumbs(product = null) {
        const container = document.querySelector('.breadcrumb-container');
        if (!container) return;
    
        const path = window.location.pathname;
        let html = '<a href="index.html">首頁</a>';
    
        if (path.includes('products.html')) {
            html += ' &gt; <span>所有產品</span>';
        } else if (path.includes('product-detail.html')) {
            html += ' &gt; <a href="products.html">所有產品</a>';
            if (product) {
                html += ` &gt; <span>${product.name}</span>`;
            }
        } else if (path.includes('login.html') || path.includes('register.html')) {
            html += ' &gt; <span>登入/註冊</span>';
        } else if (path.includes('member-center.html')) {
            html += ' &gt; <span>會員中心</span>';
        }
    
        container.innerHTML = `<nav class="breadcrumb">${html}</nav>`;
    }

    // 重構 addToCart 函式
    function addToCart(product) {
        const existingProduct = cart.find(item => item.id === product.id);

        if (existingProduct) {
            // 如果商品已存在，增加其數量
            existingProduct.quantity++;
        } else {
            // 如果是新商品，加入購物車並設定數量為 1
            cart.push({ ...product, quantity: 1 });
        }
        updateCart();
    }

    // 新增 changeQuantity 函式
    function changeQuantity(productId, change) {
        const product = cart.find(item => item.id === productId);
        if (product) {
            product.quantity += change;
            if (product.quantity <= 0) {
                // 如果數量為0或更少，則從購物車中移除該商品
                removeFromCart(productId);
            } else {
                updateCart();
            }
        }
    }

    // 重構 removeFromCart 函式
    function removeFromCart(productId) {
        cart = cart.filter(item => item.id !== productId);
        updateCart();
    }

    function updateCart() {
        // [BUG FIX] 在更新前，過濾掉任何無效的購物車項目
        cart = cart.filter(item => item && item.id);

        // 一次性更新所有與購物車相關的顯示
        updateCartCount();
        updateCartModal();
        saveCart(); // 每次更新後都儲存到 localStorage
    }

    function saveCart() {
        localStorage.setItem('shoppingCart', JSON.stringify(cart));
    }

    // 重構 updateCartCount 函式，計算總商品數量
    function updateCartCount() {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCountSpan.textContent = totalItems;
    }

    // 重構 updateCartModal 函式以顯示數量和控制按鈕
    function updateCartModal() {
        // 清空當前的購物車列表
        cartItemsContainer.innerHTML = '';

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p>您的購物車是空的。</p>';
            cartTotalSpan.textContent = 'NT$ 0';
            return;
        }

        let total = 0;
        cart.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.classList.add('cart-item');
            const subtotal = item.price * item.quantity;
            itemElement.innerHTML = `
                <div class="cart-item-details">
                    <span class="item-name">${item.name}</span>
                    <span class="item-subtotal">小計: NT$ ${subtotal.toLocaleString()}</span>
                </div>
                <div class="cart-item-controls">
                    <button class="quantity-btn" data-id="${item.id}" data-change="-1">-</button>
                    <span class="item-quantity">${item.quantity}</span>
                    <button class="quantity-btn" data-id="${item.id}" data-change="1">+</button>
                    <button class="remove-item-btn" data-id="${item.id}" title="移除商品">&times;</button>
                </div>
            `;
            cartItemsContainer.appendChild(itemElement);
            total += subtotal;
        });

        // 更新總金額
        cartTotalSpan.textContent = `NT$ ${total.toLocaleString()}`;
    }

    // 處理登入狀態顯示的函式
    function updateLoginStatus() {
        // 這裡我們用 localStorage 模擬登入狀態，未來可以替換成真實的 API 驗證
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        if (isLoggedIn) {
            navLoginLink.textContent = '會員中心';
            navLoginLink.href = 'member-center.html';
        } else {
            navLoginLink.textContent = '登入/註冊';
            navLoginLink.href = 'login.html';
        }
    }

    function renderProductDetail() {
        const container = document.getElementById('product-detail-container');
        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('id');
        
        const products = JSON.parse(localStorage.getItem('products')) || [];
        const product = products.find(p => p.id === productId);

        if (product) {
            // Update breadcrumbs with product name
            renderBreadcrumbs(product);
            // Update the page title dynamically
            document.title = `${product.name} - 我的線上商店`;

            const descriptionHtml = product.description ? product.description.replace(/\n/g, '<br>') : '店家尚未提供詳細描述。';

            container.innerHTML = `
                <div class="product-detail-layout">
                    <div class="product-detail-image">
                        <img src="${product.imageUrl}" alt="${product.name}">
                    </div>
                    <div class="product-detail-info">
                        <h1>${product.name}</h1>
                        <p class="price">NT$ ${product.price.toLocaleString()}</p>
                        <p class="description">這裡應該是商品的詳細描述。目前這個欄位還沒有在後台建立，所以暫時顯示這段文字。我們下一步可以來實作它！</p>
                        <p class="description">${descriptionHtml}</p>
                        <button class="add-to-cart-btn" 
                                data-id="${product.id}" 
                                data-name="${product.name}" 
                                data-price="${product.price}">加入購物車</button>
                    </div>
                </div>
            `;
            // After rendering the main detail, render the reviews section
            renderReviewsSection(product);
        } else {
            container.innerHTML = '<h2>找不到商品</h2><p>您要找的商品可能已經下架或不存在。</p><a href="products.html">回到商品列表</a>';
        }
    }

    function renderReviewsSection(product) {
        const container = document.querySelector('.reviews-section-container');
        if (!container) return;
    
        const reviews = product.reviews || [];
        const averageRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
    
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        const reviewFormHtml = isLoggedIn ? `
            <form id="review-form">
                <h4>發表您的評論</h4>
                <div class="form-group">
                    <label>您的評分</label>
                    <div class="star-input">
                        <span data-value="1">★</span><span data-value="2">★</span><span data-value="3">★</span><span data-value="4">★</span><span data-value="5">★</span>
                    </div>
                    <input type="hidden" id="review-rating" value="0" required>
                </div>
                <div class="form-group">
                    <label for="review-comment">您的評論</label>
                    <textarea id="review-comment" rows="4" required></textarea>
                </div>
                <button type="submit" class="submit-btn">提交評論</button>
            </form>
        ` : '<p>請先<a href="login.html">登入</a>以發表評論。</p>';
    
        container.innerHTML = `
            <div class="reviews-section">
                <h2>顧客評價</h2>
                <div class="overall-rating">
                    ${renderStarRating(averageRating, '2rem')}
                    <span class="average-rating-text">${averageRating.toFixed(1)} / 5 (${reviews.length} 則評論)</span>
                </div>
                <hr>
                <div class="review-list">
                    ${reviews.length > 0 ? reviews.map(review => `
                        <div class="review-item">
                            <div class="review-header">
                                <strong>${review.author.split('@')[0]}</strong>
                                <span class="review-date">${new Date(review.date).toLocaleDateString()}</span>
                            </div>
                            ${renderStarRating(review.rating)}
                            <p class="review-comment">${review.comment.replace(/\n/g, '<br>')}</p>
                        </div>
                    `).join('') : '<p>此商品還沒有任何評論。</p>'}
                </div>
                <hr>
                <div class="review-form-container">
                    ${reviewFormHtml}
                </div>
            </div>
        `;
    
        // Add event listeners for the new form and stars if the user is logged in
        if (isLoggedIn) {
            const starInputContainer = container.querySelector('.star-input');
            const ratingInput = container.querySelector('#review-rating');
            const stars = starInputContainer.querySelectorAll('span');
    
            const setStars = (rating) => {
                stars.forEach(star => {
                    star.classList.toggle('selected', star.dataset.value <= rating);
                });
            };
    
            starInputContainer.addEventListener('click', e => {
                if (e.target.tagName === 'SPAN') {
                    const rating = e.target.dataset.value;
                    ratingInput.value = rating;
                    setStars(rating); // Permanently set on click
                }
            });
            
            starInputContainer.addEventListener('mouseover', e => {
                if (e.target.tagName === 'SPAN') {
                    const hoverRating = e.target.dataset.value;
                    stars.forEach(star => {
                        star.style.color = star.dataset.value <= hoverRating ? '#ffc107' : '#e0e0e0';
                    });
                }
            });
    
            starInputContainer.addEventListener('mouseout', () => {
                // Revert to the clicked rating
                const currentRating = ratingInput.value;
                stars.forEach(star => {
                    star.style.color = star.dataset.value <= currentRating ? '#ffc107' : '#e0e0e0';
                });
            });
    
            document.getElementById('review-form').addEventListener('submit', (e) => {
                e.preventDefault();
                handleReviewSubmit(product.id);
            });
        }
    }

    function renderStarRating(score, size = '1rem') {
        const fillPercentage = (score / 5) * 100;
        return `
            <div class="star-rating-display">
              <div class="stars-outer" style="font-size: ${size};">
                <div class="stars-gray">★★★★★</div>
                <div class="stars-gold" style="width: ${fillPercentage}%;">★★★★★</div>
              </div>
            </div>
        `;
    }

    function processCheckout() {
        const userEmail = localStorage.getItem('userEmail');
        if (!userEmail) return;

        let history = JSON.parse(localStorage.getItem('purchaseHistory')) || {};
        if (!history[userEmail]) {
            history[userEmail] = [];
        }

        const newOrder = {
            orderId: `order-${Date.now()}`,
            date: new Date().toLocaleString('zh-TW'),
            items: [...cart], // 複製當前購物車內容
            total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
        };

        history[userEmail].unshift(newOrder); // 將最新訂單加到最前面
        localStorage.setItem('purchaseHistory', JSON.stringify(history));

        // 清空購物車
        cart = [];
        updateCart();
    }

    function renderMemberCenter() {
        const userEmail = localStorage.getItem('userEmail');
        document.getElementById('member-email').textContent = userEmail;

        const history = JSON.parse(localStorage.getItem('purchaseHistory')) || {};
        const userHistory = history[userEmail] || [];
        const historyListContainer = document.getElementById('purchase-history-list');

        if (userHistory.length === 0) {
            historyListContainer.innerHTML = '<p>您目前沒有任何購買紀錄。</p>';
            return;
        }

        historyListContainer.innerHTML = userHistory.map(order => `
            <div class="order-card">
                <div class="order-header">
                    <span>訂單日期: ${order.date}</span>
                    <span>訂單總額: NT$ ${order.total.toLocaleString()}</span>
                </div>
                <ul class="order-items">${order.items.map(item => `<li>${item.name} x ${item.quantity}</li>`).join('')}</ul>
            </div>
        `).join('');
    }

    function handleReviewSubmit(productId) {
        const rating = parseInt(document.getElementById('review-rating').value, 10);
        const comment = document.getElementById('review-comment').value.trim();
        const userEmail = localStorage.getItem('userEmail');
    
        if (rating === 0 || !comment) {
            alert('請選擇評分並留下您的評論。');
            return;
        }
    
        let products = JSON.parse(localStorage.getItem('products')) || [];
        const productIndex = products.findIndex(p => p.id === productId);
    
        if (productIndex > -1) {
            const newReview = {
                author: userEmail,
                rating: rating,
                comment: comment,
                date: new Date().toISOString()
            };
    
            if (!products[productIndex].reviews) {
                products[productIndex].reviews = [];
            }
            
            // Allow user to update their review
            const existingReviewIndex = products[productIndex].reviews.findIndex(r => r.author === userEmail);
            if (existingReviewIndex > -1) {
                products[productIndex].reviews[existingReviewIndex] = newReview;
            } else {
                products[productIndex].reviews.push(newReview);
            }
    
            localStorage.setItem('products', JSON.stringify(products));
            showNotification('感謝您的評論！');
            renderProductDetail(); // Re-render the whole detail section
        }
    }

    function renderProducts() {
        const productGrid = document.querySelector('.product-grid');
        if (!productGrid) return; // 如果頁面沒有商品區塊，就直接返回

        const products = JSON.parse(localStorage.getItem('products')) || [];

        if (products.length === 0) {
            productGrid.innerHTML = '<p>目前店家尚未上架商品喔！</p>';
            return;
        }

        productGrid.innerHTML = products.map(product => `
            <div class="product-card">
                <img src="${product.imageUrl}" alt="${product.name}">
                <h3>${product.name}</h3>
                <p class="price">NT$ ${product.price.toLocaleString()}</p>
                <div class="product-card-buttons">
                    <a href="product-detail.html?id=${product.id}" class="detail-btn">商品詳情</a>
                    <button class="add-to-cart-btn" 
                            data-id="${product.id}" 
                            data-name="${product.name}" 
                            data-price="${product.price}">加入購物車</button>
                </div>
            </div>
        `).join('');
    }

    function openCartModal() {
        updateCartModal(); // 確保顯示前購物車內容是最新
        cartModal.style.display = 'block';
    }

    function closeCartModal() {
        cartModal.style.display = 'none';
    }

    // 顯示一個短暫的通知
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.className = 'notification';
        document.body.appendChild(notification);
        // 動畫和移除由 CSS 的 @keyframes 控制
    }
});