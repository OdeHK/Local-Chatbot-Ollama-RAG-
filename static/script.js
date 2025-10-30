let socket;
let currentAssistantMessage = null;
let isStreaming = false;

const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');

const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status-text');

function connectWebSocket() {
    socket = new WebSocket(`ws://${window.location.host}/ws/chat`);

    socket.onopen = () => {
        console.log('WebSocket connected');
        updateConnectionStatus('connected');
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'stream') {
            handleStreamChunk(data.content);
        } else if (data.type === 'end') {
            handleStreamEnd();
        }
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus('disconnected');
    };

    socket.onclose = () => {
        console.log('WebSocket disconnected. Reconnecting in 3 seconds...');
        updateConnectionStatus('disconnected');
        setTimeout(connectWebSocket, 3000);
    };
}

function updateConnectionStatus(status) {
    statusDot.className = `status-dot ${status}`;

    const statusMessages = {
        'connected': 'Đã kêt nối',
        'disconnected': 'Mất kết nối',
        'reconnecting': 'Đang kết nối...'
    };

    statusText.textContent = statusMessages[status] || 'Unknown status';
}

// Xóa tin nhắn chào mừng khi người dùng gửi tin nhắn đầu tiên
function removeWelcomeMessage() {
    const welcomeMsg = chatMessages.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
}

// Tạo tin nhắn người dùng
function addUserMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    messageDiv.innerHTML = `
        <div class="message-avatar">H</div>
        <div class="message-content">${escapeHTML(text)}</div>
    `;

    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

// Tạo tin nhắn trợ lý (streaming)
function createAssistantMessage() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    messageDiv.innerHTML = `
        <div class="message-avatar">B</div>
        <div class="message-content streaming"></div>
    `;
    chatMessages.appendChild(messageDiv);
    currentAssistantMessage = messageDiv.querySelector('.message-content');
    scrollToBottom();

    return currentAssistantMessage;
}

function handleStreamChunk(content) {
    if (!currentAssistantMessage) {
        createAssistantMessage();
    }

    currentAssistantMessage.textContent += content;
    scrollToBottom();
}

function handleStreamEnd() {
    if (currentAssistantMessage) {
        currentAssistantMessage.classList.remove('streaming');

        // Parse markdown và format
        const fullText = currentAssistantMessage.dataset.fullText || currentAssistantMessage.textContent;
        currentAssistantMessage.innerHTML = formaResponse(fullText);

        currentAssistantMessage = null;
    }

    isStreaming = false;
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();
}

function formaResponse(raw) {
    const md = window.markdownit();
    // 1.1. Chuyển \\n thành xuống dòng thật
    let fixed = raw.replace(/\\n/g, "\n");

    // 1.2. Thêm thụt lề cho các numbering (1., 2., 3., ...)
    fixed = fixed.replace(/(^\d+\.\s)/gm, "  $1");

    // 2. Parse Markdown
    let markdown = md.render(fixed);

    // 3. Làm sạch để tránh XSS
    return DOMPurify.sanitize(markdown);
}

function sendMessage(text) {
    if (!text.trim() || !socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }

    removeWelcomeMessage();
    addUserMessage(text);

    isStreaming = true;
    messageInput.disabled = true;
    sendButton.disabled = true;

    socket.send(text);

    messageInput.value = '';
    messageInput.style.height = 'auto';
}

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value;
    sendMessage(text);
});

// Enter to send, Shift+Enter for new line
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
});

// Auto-resize textarea
messageInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

connectWebSocket();

