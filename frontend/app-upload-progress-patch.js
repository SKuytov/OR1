// ===================== ORDERS WITH UPLOAD PROGRESS =====================
// This is a REPLACEMENT for the handleCreateOrder function in app.js
// Copy this function and replace the existing handleCreateOrder in app.js

async function handleCreateOrder(e) {
    e.preventDefault();

    const selectedCC = document.querySelector('input[name="costCenter"]:checked');
    if (!selectedCC) {
        alert('Please select a Cost Center');
        return;
    }

    const formData = new FormData();
    formData.append('building', buildingSelect.value);
    formData.append('costCenterId', selectedCC.value);
    formData.append('itemDescription', document.getElementById('itemDescription').value.trim());
    formData.append('partNumber', document.getElementById('partNumber').value.trim());
    formData.append('category', document.getElementById('category').value.trim());
    formData.append('quantity', document.getElementById('quantity').value);
    formData.append('dateNeeded', document.getElementById('dateNeeded').value);
    formData.append('priority', document.getElementById('priority').value);
    formData.append('notes', document.getElementById('notes').value.trim());
    formData.append('requester', currentUser.name);
    formData.append('requesterEmail', currentUser.email);

    const files = document.getElementById('attachments').files;
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    // Show progress overlay
    if (window.UploadProgress) {
        window.UploadProgress.show();
    }

    // Use XMLHttpRequest for upload progress tracking
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && window.UploadProgress) {
                const percentComplete = (e.loaded / e.total) * 100;
                window.UploadProgress.update(percentComplete);
            }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
            if (window.UploadProgress) {
                window.UploadProgress.hide();
            }

            try {
                const data = JSON.parse(xhr.responseText);
                if (!data.success) {
                    alert('Failed to create order: ' + (data.message || 'Unknown error'));
                    reject(new Error(data.message));
                    return;
                }
                alert('Order created successfully!');
                createOrderForm.reset();
                if (currentUser.role === 'requester') {
                    buildingSelect.value = currentUser.building;
                    renderCostCenterRadios(currentUser.building);
                }
                loadOrders();
                resolve(data);
            } catch (err) {
                alert('Failed to process server response.');
                reject(err);
            }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
            if (window.UploadProgress) {
                window.UploadProgress.hide();
            }
            alert('Failed to create order. Network error.');
            reject(new Error('Network error'));
        });

        xhr.addEventListener('abort', () => {
            if (window.UploadProgress) {
                window.UploadProgress.hide();
            }
            alert('Upload cancelled.');
            reject(new Error('Upload cancelled'));
        });

        // Open connection and send
        xhr.open('POST', `${API_BASE}/orders`);
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        xhr.send(formData);
    });
}
