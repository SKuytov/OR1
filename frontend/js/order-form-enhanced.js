// Enhanced Order Form - File Preview UX Only
// This script ONLY adds visual file preview - does NOT touch form submission

(function() {
    'use strict';
    
    let selectedFiles = [];
    let procSelectedFiles = [];  // ⭐ NEW: Separate files for modal
    
    function init() {
        // Wait for DOM to be fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupFilePreview);
        } else {
            setupFilePreview();
        }
    }
    
    function setupFilePreview() {
        // ========================================
        // REQUESTER FORM (existing)
        // ========================================
        const fileInput = document.getElementById('attachments');
        if (fileInput) {
            // Ensure multiple attribute is set
            fileInput.setAttribute('multiple', 'multiple');
            
            // Listen for file selection changes
            fileInput.addEventListener('change', handleFileSelection, false);
            
            console.log('File preview enhancement loaded (requester form)');
        }
        
        // ========================================
        // PROCUREMENT MODAL (NEW)
        // ========================================
        const procFileInput = document.getElementById('procAttachments');
        if (procFileInput) {
            // Ensure multiple attribute is set
            procFileInput.setAttribute('multiple', 'multiple');
            
            // Listen for file selection changes
            procFileInput.addEventListener('change', handleProcFileSelection, false);
            
            console.log('File preview enhancement loaded (modal)');
        }
    }
    
    // ========================================
    // REQUESTER FORM HANDLERS
    // ========================================
    function handleFileSelection(event) {
        const files = Array.from(event.target.files || []);
        selectedFiles = files;
        renderFilePreview('file-preview-container', selectedFiles, 'attachments');
    }
    
    // ========================================
    // MODAL HANDLERS (NEW)
    // ========================================
    function handleProcFileSelection(event) {
        const files = Array.from(event.target.files || []);
        procSelectedFiles = files;
        renderFilePreview('proc-file-preview-container', procSelectedFiles, 'procAttachments');
    }
    
    // ========================================
    // UNIVERSAL RENDER FUNCTION
    // ========================================
    function renderFilePreview(containerId, filesArray, inputId) {
        let container = document.getElementById(containerId);
        
        // Create container if it doesn't exist
        if (!container) {
            const fileInput = document.getElementById(inputId);
            if (!fileInput || !fileInput.parentElement) return;
            
            container = document.createElement('div');
            container.id = containerId;
            container.className = 'file-preview-container';
            fileInput.parentElement.appendChild(container);
        }
        
        // Clear if no files
        if (filesArray.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        // Build preview HTML
        let html = '<div class="file-preview-header">Selected Files (' + filesArray.length + ')</div>';
        html += '<div class="file-preview-list">';
        
        filesArray.forEach(function(file, index) {
            const fileSize = formatFileSize(file.size);
            const fileIcon = getFileIcon(file.name);
            
            html += '<div class="file-preview-item" data-index="' + index + '">';
            html += '<span class="file-icon">' + fileIcon + '</span>';
            html += '<div class="file-info">';
            html += '<div class="file-name">' + escapeHtml(file.name) + '</div>';
            html += '<div class="file-size">' + fileSize + '</div>';
            html += '</div>';
            html += '<button type="button" class="file-remove-btn" data-index="' + index + '" data-input="' + inputId + '" aria-label="Remove file">';
            html += '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">';
            html += '<path d="M4 4l8 8m0-8l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
            html += '</svg>';
            html += '</button>';
            html += '</div>';
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Attach remove button listeners
        const removeButtons = container.querySelectorAll('.file-remove-btn');
        removeButtons.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault(); // Prevent any form submission
                const index = parseInt(btn.getAttribute('data-index'), 10);
                const inputIdFromBtn = btn.getAttribute('data-input');
                removeFile(index, inputIdFromBtn, containerId);
            });
        });
    }
    
    function removeFile(index, inputId, containerId) {
        // Determine which array to modify
        let filesArray = (inputId === 'procAttachments') ? procSelectedFiles : selectedFiles;
        
        filesArray.splice(index, 1);
        
        // Update the appropriate global array
        if (inputId === 'procAttachments') {
            procSelectedFiles = filesArray;
        } else {
            selectedFiles = filesArray;
        }
        
        // Update the actual file input
        const fileInput = document.getElementById(inputId);
        if (!fileInput) return;
        
        try {
            const dataTransfer = new DataTransfer();
            filesArray.forEach(function(file) {
                dataTransfer.items.add(file);
            });
            fileInput.files = dataTransfer.files;
        } catch (e) {
            console.warn('Could not update file input:', e);
        }
        
        renderFilePreview(containerId, filesArray, inputId);
    }
    
    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            'pdf': '📄',
            'doc': '📝', 'docx': '📝',
            'xls': '📊', 'xlsx': '📊',
            'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
            'zip': '📦', 'rar': '📦', '7z': '📦',
            'txt': '📃',
            'csv': '📊'
        };
        return iconMap[ext] || '📎';
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Initialize
    init();
})();
