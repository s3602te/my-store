document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('admin-login-form');
    const dashboardContainer = document.querySelector('.admin-container');

    // --- Admin Login Page Logic ---
    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            // Hardcoded credentials
            if (username === 'user' && password === '1234') {
                // Use sessionStorage for admin login state, so it clears when tab is closed
                sessionStorage.setItem('isAdminLoggedIn', 'true');
                window.location.href = 'dashboard.html';
            } else {
                alert('帳號或密碼錯誤！');
            }
        });
    }

    // --- Admin Dashboard Page Logic ---
    if (dashboardContainer) {
        // Auth Guard: Check if admin is logged in
        if (sessionStorage.getItem('isAdminLoggedIn') !== 'true') {
            alert('請先登入！');
            window.location.href = 'index.html';
            return; // Stop further execution
        }

        // --- Modal Elements ---
        const editProductModal = document.getElementById('edit-product-modal');
        const closeEditModalBtn = editProductModal.querySelector('.close-btn');
        const editProductForm = document.getElementById('edit-product-form');


        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('isAdminLoggedIn');
            window.location.href = 'index.html';
        });

        // Render initial data
        renderUserList();
        renderProductList();

        // Handle Add Product Form
        const addProductForm = document.getElementById('add-product-form');
        addProductForm.addEventListener('submit', (event) => {
            event.preventDefault();
            
            const name = document.getElementById('product-name').value;
            const price = parseFloat(document.getElementById('product-price').value);
            let imageUrl = document.getElementById('product-image').value;

            // 圖片為選填，若未填寫則給一個預設圖片，避免前台破圖
            if (!imageUrl) {
                // 使用一個符合網站風格的預設圖
                imageUrl = 'https://via.placeholder.com/250/f7c5cc/5c5c5c?text=No+Image';
            }

            if (name && price > 0) {
                addProduct({ name, price, imageUrl });
                addProductForm.reset();
            } else {
                alert('請務必填寫商品名稱與價格，且價格需大於0。');
            }
        });

        // Handle Product/User Deletion using Event Delegation
        const productListContainer = document.getElementById('product-list-container');
        productListContainer.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList.contains('delete-btn')) {
                const productId = target.dataset.id;
                if (confirm(`確定要刪除 ID 為 ${productId} 的商品嗎？此操作無法復原。`)) {
                    deleteProduct(productId);
                }
            } else if (target.classList.contains('edit-btn')) {
                const productId = target.dataset.id;
                openEditModal(productId);
            }
        });

        const userListContainer = document.getElementById('user-list-container');
        userListContainer.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList.contains('delete-btn')) {
                const userEmail = target.dataset.email;
                if (confirm(`確定要刪除會員 ${userEmail} 嗎？此操作無法復原。`)) {
                    deleteUser(userEmail);
                }
            } else if (target.classList.contains('edit-btn')) {
                alert('修改會員功能尚未實作。');
            }
        });

        // --- Modal Event Listeners ---
        closeEditModalBtn.addEventListener('click', closeEditModal);

        window.addEventListener('click', (event) => {
            if (event.target == editProductModal) {
                closeEditModal();
            }
        });

        editProductForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const id = document.getElementById('edit-product-id').value;
            const name = document.getElementById('edit-product-name').value;
            const price = parseFloat(document.getElementById('edit-product-price').value);
            let imageUrl = document.getElementById('edit-product-image').value;

            if (!imageUrl) {
                imageUrl = 'https://via.placeholder.com/250/f7c5cc/5c5c5c?text=No+Image';
            }

            if (id && name && price > 0) {
                updateProduct(id, { name, price, imageUrl });
            } else {
                alert('請填寫所有必填欄位，且價格需大於0。');
            }
        });
    }
});

// --- Data Fetching and Rendering Functions ---

function openEditModal(productId) {
    const product = getProducts().find(p => p.id === productId);
    if (product) {
        document.getElementById('edit-product-id').value = product.id;
        document.getElementById('edit-product-name').value = product.name;
        document.getElementById('edit-product-price').value = product.price;
        document.getElementById('edit-product-image').value = product.imageUrl;
        document.getElementById('edit-product-modal').style.display = 'block';
    }
}

function closeEditModal() {
    document.getElementById('edit-product-modal').style.display = 'none';
}

function getProducts() {
    return JSON.parse(localStorage.getItem('products')) || [];
}

function saveProducts(products) {
    localStorage.setItem('products', JSON.stringify(products));
}

function getUsers() {
    return JSON.parse(localStorage.getItem('users')) || [];
}

function saveUsers(users) {
    localStorage.setItem('users', JSON.stringify(users));
}

function renderUserList() {
    const users = getUsers();
    const container = document.getElementById('user-list-container');
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = '<p>目前沒有已註冊的會員。</p>';
        return;
    }

    const table = `
        <table>
            <thead>
                <tr>
                    <th>電子郵件 (帳號)</th>
                    <th>密碼</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(user => `
                    <tr>
                        <td>${user.email}</td>
                        <td>${user.password}</td>
                        <td class="action-buttons">
                            <button class="edit-btn" data-email="${user.email}">修改</button>
                            <button class="delete-btn" data-email="${user.email}">刪除</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = table;
}

function renderProductList() {
    const products = getProducts();
    const container = document.getElementById('product-list-container');
    if (!container) return;

    if (products.length === 0) {
        container.innerHTML = '<p>目前沒有任何商品。請在上方新增商品。</p>';
        return;
    }

    const table = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>名稱</th>
                    <th>價格</th>
                    <th>圖片預覽</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${products.map(product => `
                    <tr>
                        <td>${product.id}</td>
                        <td>${product.name}</td>
                        <td>NT$ ${product.price.toLocaleString()}</td>
                        <td><img src="${product.imageUrl}" alt="${product.name}" width="50"></td>
                        <td class="action-buttons">
                            <button class="edit-btn" data-id="${product.id}">修改</button>
                            <button class="delete-btn" data-id="${product.id}">刪除</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = table;
}

function addProduct(newProductData) {
    const products = getProducts();
    const newProduct = {
        id: `product-${Date.now()}`,
        name: newProductData.name,
        price: newProductData.price,
        imageUrl: newProductData.imageUrl
    };
    products.push(newProduct);
    saveProducts(products);
    renderProductList(); // Re-render the list
}

function updateProduct(productId, updatedData) {
    let products = getProducts();
    const productIndex = products.findIndex(p => p.id === productId);
    if (productIndex > -1) {
        products[productIndex] = { ...products[productIndex], ...updatedData };
        saveProducts(products);
        renderProductList();
        closeEditModal();
    }
}

function deleteProduct(productId) {
    let products = getProducts();
    products = products.filter(p => p.id !== productId);
    saveProducts(products);
    renderProductList();
}

function deleteUser(userEmail) {
    let users = getUsers();
    users = users.filter(u => u.email !== userEmail);
    saveUsers(users);
    renderUserList();
}