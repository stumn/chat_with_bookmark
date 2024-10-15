
const socket = io();

// html要素の取得 ($は短縮形の関数名 = DOM要素の操作で使うと便利) 
function $(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.error(`Element with id "${id}" not found`);
    }
    return element;
}

const messageLists = $('messageLists');
const form = $('form');
const input = $('input');
const formButton = $('formButton');
const surveyForm = $('surveyForm');
const switchButton = $('switchButton');
const question = $('surveyQuestion').value;
const optionText_1 = $('option1').value;
const optionText_2 = $('option2').value;
const optionText_3 = $('option3').value;
const surveyFormElement = $('surveyForm');

// プロンプト　ログインで名前を入力・サーバーに送信
const myName = prompt("名前を入力してください", "");
if (!myName) {
    alert('名前が入力されていません。再読み込みしてください。');
    location.reload();
}
socket.emit('sign-up', myName);
$('sign-up-name').textContent = 'あなたのログイン名： ' + myName;

let docURL;
socket.on('randomString', (receivedString) => {
    docURL = `/${receivedString}/document`;
});

function OpenDocumentWindow() {
    if (docURL) {
        window.open(docURL, '_blank');
    } else {
        alert('ドキュメントURLが設定されていません。しばらくしてからもう一度お試しください。');
    }
}

// オンラインメンバー
socket.on('onlineUsers', (onlines) => {
    $('onlines').textContent = '接続中のメンバー: ' + onlines;
});

// 過去ログ受信
socket.on('pastLogs', ({ pastLogs, stackLogs }) => {
    handlePastLogs(pastLogs, stackLogs);
});

// < チャット受信
socket.on('chatLogs', (post) => {
    handleChatLogs(post);
});

// < 自分メモ受信
socket.on('memoLogs', (memo) => {
    handleMemoLogs(memo);
});

// 伏せカード登場！
socket.on('downCard', (msg) => {
    handleDownCard(msg);
});

// < アンケート投稿をサーバーから受信
socket.on('survey_post', (surveyPost) => {
    handleSurveyPost(surveyPost);
});

// < 投票を受信
socket.on('updateVote', (voteData) => {
    handleUpdateVote(voteData);
});

// < インタラクティブイベントを受信
function setUpInteractiveEventHandler(eventType) {
    socket.on(eventType, (data) => {
        const item = $(data._id);
        const countElement = item.querySelector(`.${eventType}-container span`);
        countElement.textContent = data.count;
    });
}

['up', 'down', 'bookmark'].forEach(setUpInteractiveEventHandler);

// 重ねる
socket.on('dragstart', (draggedId) => {// < ドラッグ開始 >
    $(draggedId).style.border = '3px dotted';
});

socket.on('dragend', (draggedId) => {// < ドラッグ終了 >
    $(draggedId).style.border = '';
});

// < ドラッグオーバー >
// < ドラッグリーブ >

socket.on('drop', (stackedData) => {// < ドロップ >
    handleDrop_Display(stackedData);
});

// < アラート
socket.on('alert', (alertMsg) => {
    alert(alertMsg);
});

// < ダイアログ >
socket.on('dialog_to_html', (dialogMsg) => {
    socket.emit('dialog_to_js', confirm(dialogMsg) ? true : false);
});


// ↓↓↓ handle function ↓↓↓

// handlePastLogs(pastLogs, stackLogs);
function handlePastLogs(pastLogs, stackLogs) {
    // console.log('pastLogs: ', pastLogs); // isStackingOn: false (重ね子分ではない)
    // console.log('stackLogs: ', stackLogs); // isStackingOn: true (重ね子分)

    pastLogs.forEach((pastElement) => {
        console.log('pastElement: ', pastElement);

        if (pastElement.stackedPostIds.length > 0) {
            console.log('pastElement.stackedPostIds: ', pastElement.stackedPostIds);

            const item = buildMlElement(pastElement);
            settingML(item, pastElement);

            const nestedMessageContainer = createElement('div', 'kasane');
            nestedMessageContainer.textContent = '▼';
            nestedMessageContainer.appendChild(item);

            let kobuns = [];
            stackLogs.forEach(stackElement => {
                console.log('stackElement._id: ', stackElement._id);

                for (let i = 0; i < pastElement.stackedPostIds.length; i++) {
                    if (stackElement._id == pastElement.stackedPostIds[i]) {
                        kobuns.push(stackElement);
                        console.log('合致: ', kobuns);
                    } else {
                        console.log('不一致');
                    }
                }
            });

            console.log('kobuns: ', kobuns);
            kobuns.forEach(kobun => {
                const item = buildMlElement(kobun);
                settingML(item, kobun);
                nestedMessageContainer.appendChild(item);
            });

            messageLists.appendChild(nestedMessageContainer);

        } else {
            const item = buildMlElement(pastElement);
            settingML(item, pastElement);
        }
    });

    const item = createElement('div', 'ml', '-----⇊ ここから参加 ⇊-----');
    settingML(item);

    setPastLogsDraggable();

}

// handleChatLogs(post);
function handleChatLogs(post) {
    const item = buildMlElement(post);
    item.id = post._id;
    settingML(item, post);
}

// handleMemoLogs(memo);
function handleMemoLogs(memo) {
    const item = createElement('div'); // div要素を作成
    const { userNameTimeMsg, isSurvey } = createNameTimeMsg(memo, '[memo]');

    item.appendChild(userNameTimeMsg);

    const memoSendContainer = createElement('div', 'memoSend-container');

    const button = createElement('button', 'memoSendButton', '➤');

    button.addEventListener('click', e => {
        button.classList.add("active");
        event.preventDefault();
        socket.emit('open_downCard', memo);
        button.disabled = true;
    });

    memoSendContainer.appendChild(button);
    item.appendChild(memoSendContainer);

    settingML(item, memo);
}

// handleDownCard(msg);
function handleDownCard(msg) {
    let timeSpans = document.querySelectorAll("#messageLists div span.time");
    for (let i = 0; i < timeSpans.length; i++) {
        const targetCreatedAt = msg.createdAt;
        const compare = timeSpans[i].textContent;

        const isBefore = checkIsBefore(targetCreatedAt, compare);

        if (isBefore === false) {
            console.log("target は compare の前ではない");
            if (i === timeSpans.length - 1) {
                console.log("target は 最新");
                const item = buildMlElement(msg);
                settingML(item, msg);
                return;
            }
            continue;
        }
        else if (isBefore === true) {
            console.log("target は compare の前に入る");
            // ここで、messageLists に入れ込む
            console.log('messageLists: ', messageLists);

            const item = buildMlElement(msg);
            console.log('item: ', item);

            let parentDIV = timeSpans[i].closest('.ml');

            // const parentDIV = timeSpans[i+1].closest('.ml');
            console.log('parentDIV: ', parentDIV);

            if (parentDIV.parentNode.classList.contains('kasane')) {
                parentDIV = parentDIV.parentNode;

                console.log('changed parentDIV: ', parentDIV);
            }
            messageLists.insertBefore(item, parentDIV);

            item.id = msg._id;
            item.classList.add('ml', 'downCard', 'visible');
            return;
        }
    }
}

// handleSurveyPost(surveyPost);
function handleSurveyPost(surveyPost) {
    const item = buildMlElement(surveyPost);
    item.id = surveyPost._id;
    settingML(item, surveyPost);
}

// handleUpdateVote(voteData);
function handleUpdateVote(voteData) {
    const item = $(voteData._id);
    for (let i = 0; i < 3; i++) {
        const surveyNum = item.querySelector(`.survey-container .survey-num-${i + 1}`);
        surveyNum.textContent = voteData[`count${i}`];
    }
}

// handleDrop_Display(stackedData);
function handleDrop_Display(stackedData) {
    console.log('draggedId: ', stackedData.draggedId);
    console.log('dropId: ', stackedData.dropId);

    const draggedElement = $(stackedData.draggedId);
    const stackedMl = $(stackedData.dropId);

    // Create a new div with the class 'kasane'
    const nestedMessageContainer = createElement('div', 'kasane');
    nestedMessageContainer.textContent = '▼';

    messageLists.insertBefore(nestedMessageContainer, stackedMl); // Insert the kasane div before the dropElement
    nestedMessageContainer.appendChild(stackedMl); // Append the dropElement
    nestedMessageContainer.appendChild(draggedElement); // Append the dragged element
    stackedMl.style.border = '3px solid';
    stackedMl.style.color = '#227B94';
}

// ↓↓↓ sub function ↓↓↓

function setPastLogsDraggable() {
    // Get all .ml elements
    const mlArray = messageLists.getElementsByClassName("ml");
    console.log('mlArray: ', mlArray);

    // Make each .ml element draggable
    for (let element of mlArray) {
        element.classList.add('draggable');
    }

    // Get all .draggable elements
    const elements = document.querySelectorAll(".draggable");

    // Add event listeners to each .draggable element
    elements.forEach(element => {
        element.setAttribute('draggable', 'true');
        addDragAndDropListeners(element);
    });
}

// Initialize the dragged element
let draggedElement = null;

function addDragAndDropListeners(element) {
    element.addEventListener('dragstart', handleDragStart);
    element.addEventListener('dragend', handleDragEnd);
    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('drop', handleDrop_Now);
}

function handleDragStart(event) {
    event.dataTransfer.effectAllowed = "move";
    draggedElement = event.target;
    setTimeout(() => {
        event.target.style.visibility = 'hidden'; // Hide the element during the drag
    }, 0);
    socket.emit('dragstart', event.target.id);
}

function handleDragEnd(event) {
    event.target.style.visibility = ''; // Restore visibility
    draggedElement = null;
    socket.emit('dragend', event.target.id);
}

function handleDragOver(event) {
    // Restrict drop targets based on classes
    if (event.target.classList.contains("name-time-msg") || event.target.classList.contains("buttons")) {
        event.dataTransfer.dropEffect = "none"; // Disable drop for invalid targets
        return;
    }

    event.preventDefault();  // Allow dropping by preventing default behavior

    // Provide visual feedback for valid targets
    this.style.border = '3px solid';
    this.style.color = '#227B94';
}

function handleDragLeave(event) {
    this.style.border = ""; // Reset visual feedback
    this.style.color = '';
}

function handleDrop_Now(event) {
    event.preventDefault();
    if (draggedElement) {
        console.log('draggedElement: ', draggedElement);

        const dropElement = event.target.closest('.ml');
        if (dropElement) {
            createKasaneDiv(draggedElement, dropElement);
            socket.emit('drop', { draggedId: draggedElement.id, dropId: dropElement.id });
        } else {
            console.log('dropElement: ', dropElement);
        }
    }
}

function createKasaneDiv(draggedElement, dropElement) {
    // Create a new div with the class 'kasane'
    const nestedMessageContainer = createElement('div', 'kasane');
    nestedMessageContainer.textContent = '▼';
    console.log('nestedMessageContainer: ', nestedMessageContainer);
    console.log('dropElement: ', dropElement);
    console.log("dropElement parent: ", dropElement.parentNode);

    // Insert the nestedMessageContainer before the dropElement
    messageLists.insertBefore(nestedMessageContainer, dropElement);

    // Append the dropElement and the dragged element to the nestedMessageContainer
    nestedMessageContainer.appendChild(dropElement);
    nestedMessageContainer.appendChild(draggedElement);

    // Restore visibility and reset styles
    draggedElement.style.visibility = '';
    dropElement.style.border = "";
    dropElement.style.color = '';
}

function createElement(tag, className = '', text = '') {
    try {
        const element = document.createElement(tag);
        if (className) element.classList.add(className);
        if (text) element.textContent = text;
        return element;
    } catch (error) {
        console.error(`Invalid element creation: ${error.message}`);
        return null;  // 要素の作成に失敗した場合、nullを返す
    }
}

function buildMlElement(message, userName = message.name) {

    const item = createElement('div', 'ml');

    // 1 nameTiemMsg
    const { userNameTimeMsg, isSurvey } = createNameTimeMsg(message, userName);
    item.appendChild(userNameTimeMsg);

    // (2) case survey => options and votes
    if (isSurvey) {
        const surveyContainer = makeSurveyContainerElement(message);
        item.appendChild(surveyContainer);
    }

    // 3 buttons
    const buttons = createActionButtons(message);
    item.appendChild(buttons);

    return item;
}

// 1 userName + time + message
function createNameTimeMsg(message, nameText = message.name) {
    const userNameTimeMsg = createElement('div', 'userName-time-msg');
    const userName_time = createElement('div', 'userName-time');
    const userName = createElement('span', 'userName', nameText);
    const time = createElement('span', 'time', message.createdAt);

    userName_time.append(userName, time);
    userNameTimeMsg.appendChild(userName_time);

    const message_div = createElement('div', 'message-text', message.question || message.msg);
    userNameTimeMsg.appendChild(message_div);

    const isSurvey = Boolean(message.question);
    return { userNameTimeMsg, isSurvey };
}

// (2)
function makeSurveyContainerElement(message) {
    const surveyContainer = createElement('div', 'survey-container');
    for (let i = 0; i < message.options.length; i++) {
        const surveyOption = createElement('button', 'survey-option', message.options[i] || '');

        surveyOption.addEventListener('click', () => {
            socket.emit('survey', message._id, i);
        });

        const tentativeSums = message.voteSums ? message.voteSums : [0, 0, 0];

        console.log('tentativeSums[i]: ', tentativeSums[i]);
        const surveyNum = createElement('span', 'survey-num-' + (i + 1), tentativeSums[i]);

        surveyContainer.appendChild(surveyOption);
        surveyContainer.appendChild(surveyNum);
    }
    return surveyContainer;
}

// 3 buttons
function createActionButtons(message) {
    const buttons = createElement('div', 'buttons');
    ['up', 'down', 'bookmark'].forEach(eventType => {
        buttons.appendChild(makeActionButtonContainer(eventType, message));
    });
    return buttons;
}

function makeActionButtonContainer(eventType, message) {

    const eventData = {
        up: { className: 'up-container', emoji: '⇧', count: message.ups || 0 },
        down: { className: 'down-container', emoji: '⇩', count: message.downs || 0 },
        bookmark: { className: 'bookmark-container', emoji: '🔖', count: message.bookmarks || 0 }
    }[eventType];

    const container = createElement('div', eventData.className);
    const button = createElement('button', 'actionButton', eventData.emoji);
    const count = createElement('span', `${eventType}-count`, eventData.count);

    button.addEventListener('click', e => {
        button.classList.toggle("active");
        socket.emit('event', eventType, message._id);
    });

    container.appendChild(button);
    container.appendChild(count);
    return container;
}

function settingML(item, message = {}, shouldScroll = true) {
    item.classList.add('draggable');
    item.setAttribute('draggable', 'true');
    addDragAndDropListeners(item);

    messageLists.appendChild(item);

    if (message._id) {
        item.id = message._id;
    }

    if (shouldScroll) {
        window.scrollTo(0, document.body.scrollHeight);
    }
}

switchButton.addEventListener('change', toggleMemoMode);

function toggleMemoMode() {
    if (switchButton.checked) {
        input.placeholder = 'メモ あなただけに表示';
        formButton.textContent = 'Memo';
        formButton.classList.add('memoButton');
    } else {
        input.placeholder = 'メッセージ みんなに表示';
        formButton.textContent = 'Send';
        formButton.classList.remove('memoButton');
    }
}

form.addEventListener('submit', (event) => {
    event.preventDefault();

    const isChecked = switchButton.checked;

    console.log('input.value: ', input.value);
    console.log('チェックボックスの状態: ', isChecked);

    const eventName = isChecked ? 'personal memo' : 'chat message';
    socket.emit(eventName, input.value);

    input.value = '';
});

function checkIsBefore(target, compare) {
    const targetDate = new Date(target);
    const compareDate = new Date(compare);
    return targetDate < compareDate;
}

// アンケート投稿をサーバーに送信 >
surveyForm.addEventListener('submit', (event) => {
    event.preventDefault();
    socket.emit('submitSurvey', { question: question, options: [optionText_1, optionText_2, optionText_3] });
    toggleSurveyFormVisibility();
});

// アンケート作成の表示切り替え関数
function toggleSurveyFormVisibility() {
    surveyFormElement.style.display = surveyFormElement.style.display === 'none' ? 'block' : 'none';
}
