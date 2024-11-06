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
const status = $('status');
const form = $('form');
const input = $('input');
const formButton = $('formButton');
const checkBox = $('checkBox');

let dropElement;

// プロンプト　ログインで名前を入力・サーバーに送信
const myName = prompt("名前を入力してください", "");
if (!myName) {
    alert('名前が入力されていません。再読み込みしてください。');
    // 記号を含む場合は、変更してもらう（記号を含まないように指示しておく）
    location.reload();
}
socket.emit('sign-up', myName);
$('sign-up-name').textContent = 'あなた： ' + myName;

let docURL;
socket.on('randomString', (receivedString) => {
    docURL = `/${receivedString}/${myName}/document`;
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
    $('onlines').textContent = '接続中: ' + onlines.length + '人';
});

// status
const openCardStatus = new Map();
setInterval(updateStatus, 1000); // update

socket.on('status', (data) => {
    openCardStatus.set(data, new Date());
});

function updateStatus() {
    let name, difference, text;

    for (let [data, date] of openCardStatus) {
        if (Date.now() - date > 1000 * 60) {
            openCardStatus.delete(data);
        }
        name = data.name;
        difference = Math.abs(data.difference);
        const second = Math.round(difference / 1000);
        text = second < 20 ? '' : `${name}さんが${second}秒前のメモを公開しました`;
        // text = `${name}さんが${second}秒前のメモを公開しました`;

        if (difference > 60 * 1000) {
            const minute = Math.round(difference / 60000);
            text = `${name}さんが${minute}分前のメモを公開しました`;
        }
    }
    $('status').textContent = openCardStatus.size > 0 ? text : '';
}

function GoToTheOpenCard() {
    // 目当ての投稿へひとっとび
    // ～秒前∧名前∧伏せカード で探せる
}

// 過去ログ受信
socket.on('pastLogs', ({ pastLogs, stackLogs }) => {
    handlePastLogs(pastLogs, stackLogs);
});

// < チャット受信
socket.on('myChat', (post) => {
    handleMyChat(post);
});

socket.on('chatLogs', (post) => { // other people
    handleChatLogs(post);
});

// < アンケート投稿をサーバーから受信
socket.on('mySurvey', (post) => {
    handleMySurvey(post);
});

// < 自分メモ受信
socket.on('memoLogs', (memo) => {
    handleMemoLogs(memo); //draggable
});

// let currentColor = { r: 38, g: 49, b: 101 }; // 初期の色
// socket.on('memoCount', (memoCount) => {
//     console.log('memoCount: ', memoCount);

//     const header = document.querySelector('header');

//     const endColor = { r: 184, g: 46, b: 46 }; // 最終的に目指す色
//     const maxMemoCount = 30; // memoCount がこの値に達すると完全に赤になる
//     const progress = Math.min(memoCount / maxMemoCount, 1); // 0から1までの範囲で進捗率を計算
//     console.log('progress: ', progress);

//     // memoCount に応じて現在の色を更新
//     const redIntensity = Math.round(currentColor.r + (endColor.r - currentColor.r) * progress);
//     const greenIntensity = Math.round(currentColor.g + (endColor.g - currentColor.g) * progress);
//     const blueIntensity = Math.round(currentColor.b + (endColor.b - currentColor.b) * progress);

//     console.log(redIntensity, greenIntensity, blueIntensity);
//     header.style.backgroundColor = `rgb(${redIntensity}, ${greenIntensity}, ${blueIntensity})`;
// });

// 伏せカード登場！
socket.on('myOpenCard', (msg) => {
    handleMyOpenCard(msg); // draggable
})

socket.on('downCard', (msg) => {
    handleDownCard(msg); // not draggable
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

    pastLogs.forEach((pastElement) => {

        // 重ね子分が存在する場合
        if (pastElement.stackedPostIds.length > 0) {
            appendNestedContainer_fromPastLogs(pastElement, stackLogs);
        }
        else { // 重ね子分が存在しない場合
            const item = buildMlElement(pastElement);
            if (pastElement.isOpenCard) {
                item.classList.add('downCard', 'visible');
            }
            addBeingDraggedListeners(item);
            appendChild_IdScroll(item, pastElement, false);
        }
    });

    markTheBeginingOfParticipate(); // ここから参加
}

function markTheBeginingOfParticipate() {
    const item = createElement('div', 'ml', '-----⇊ ここから参加 ⇊-----');
    appendChild_IdScroll(item, {}, false);
}

function appendNestedContainer_fromPastLogs(pastElement, stackLogs) {

    const master = createElement('summary', 'ml');
    master.appendChild(createNameTimeMsg(pastElement));
    createSurveyContainer(pastElement, master);
    master.appendChild(createActionButtons(pastElement));

    if (pastElement.isOpenCard) {
        master.classList.add('downCard', 'visible');
    }
    // enableDragDrop(master);
    appendChild_IdScroll(master, pastElement, false);

    const accordionContainer = createElement('details', 'accordion');
    accordionContainer.appendChild(master);

    let kobuns = makeKobunsArray(stackLogs, pastElement);
    accordionContainer.style.borderLeft = `${kobuns.length * 2}px solid #EF7D3C`;

    let children = createElement('div', 'children');
    // 重ね子分を表示
    kobuns.forEach(kobun => {
        const child = createElement('p', 'child');
        child.appendChild(createNameTimeMsg(kobun));
        createSurveyContainer(kobun, child);
        child.appendChild(createActionButtons(kobun));
        child.id = kobun._id;
        children.appendChild(child);
    });

    accordionContainer.appendChild(children);    
    addBeingDraggedListeners(accordionContainer);
    messageLists.appendChild(accordionContainer);
}

function makeKobunsArray(stackLogs, pastElement) {
    let kobuns = [];
    stackLogs.forEach(stackElement => {
        for (let i = 0; i < pastElement.stackedPostIds.length; i++) {
            if (stackElement._id == pastElement.stackedPostIds[i]) {
                kobuns.push(stackElement);
            }
        }
    });
    return kobuns;
}

function handleMyChat(post) { // MyChat
    const item = buildMlElement(post);
    enableDragDrop(item);
    appendChild_IdScroll(item, post, true);
}

function handleChatLogs(post) { // ChatLogs
    const item = buildMlElement(post);
    // item.classList.add('UNdraggable');
    addBeingDraggedListeners(item);
    appendChild_IdScroll(item, post, true);
}

function handleMySurvey(post) { // MySurvey
    const item = buildMlElement(post);
    enableDragDrop(item);
    appendChild_IdScroll(item, post, true);
}

// handleMemoLogs(memo); 自分メモ受信
function handleMemoLogs(memo, shouldScroll = true) { // buildMlElement(message);に近い
    const item = buildMlBaseStructure(memo, '[memo]');
    item.classList.add('memo');
    const memoSendContainer = buildMemoSendContainer(memo);
    item.appendChild(memoSendContainer);

    enableDragDrop(item);
    appendChild_IdScroll(item, memo, shouldScroll);
}

function buildMemoSendContainer(memo) {
    const memoSendContainer = createElement('div', 'memoSend-container');

    const button = createElement('button', 'memoSendButton', '➤');
    button.addEventListener('click', e => {
        button.classList.add("active");
        e.preventDefault();
        socket.emit('open_downCard', memo);
        button.disabled = true;
        button.closest('.memo').classList.add('invisibleMemo');
    });

    memoSendContainer.appendChild(button);
    return memoSendContainer;
}

// handleMyOpenCard(msg);
function handleMyOpenCard(msg) {
    handleDownCard(msg, true);
}

// handleDownCard(msg);
function handleDownCard(msg, isMine = false) {
    const targetCreatedAt = msg.createdAt;
    const timeSpans = document.querySelectorAll("#messageLists div span.time");

    for (let i = 0; i < timeSpans.length; i++) {
        const compare = timeSpans[i].textContent;
        const isBefore = checkIsBefore(targetCreatedAt, compare);

        if (isBefore === false) {
            if (i === timeSpans.length - 1) { // 最新
                insertDownCard(msg, timeSpans, i, true, isMine);
                return;
            }
            continue;
        }
        else { // ここで messageLists に挿入
            insertDownCard(msg, timeSpans, i, false, isMine);
            return;
        }
    }
}

function insertDownCard(msg, timeSpans, index, isLatest = false, isMine) {
    const item = buildMlElement(msg);

    if (isMine) { // 自分の投稿⇒D&D可能
        enableDragDrop(item);
    } else {
        item.classList.add('UNdraggable');
        addBeingDraggedListeners(item);
    }

    if (isLatest) {
        appendChild_IdScroll(item, msg, true);

    } else {
        let parentDIV = timeSpans[index].closest('.ml');

        if (parentDIV.parentNode.classList.contains('kasane')) {
            parentDIV = parentDIV.parentNode;
        }
        messageLists.insertBefore(item, parentDIV);
    }

    item.id = msg._id;
    item.classList.add('ml', 'downCard', 'visible');
}

// handleUpdateVote(voteData);
function handleUpdateVote(voteData) {
    const item = $(voteData._id);
    voteData.voteSums.forEach((voteSum, i) => {
        const surveyNum = item.querySelector(`.survey-container .survey-num-${i}`);
        surveyNum.textContent = voteSum;
    });
}

// handleDrop_Display(stackedData);
function handleDrop_Display(data) {
    const draggedElement = $(data.draggedId);
    const dropElement = $(data.dropId);

    if (dropElement.classList.contains('kasane') || dropElement.parentNode.classList.contains('kasane')) {
        let parentDIV = dropElement.closest('.kasane');
        parentDIV.appendChild(draggedElement);
    } else {
        createKasaneDiv(draggedElement, dropElement);
    }
}

// Initialize the dragged element
let draggedElement = null;

function addDragListeners(element) {
    element.addEventListener('dragstart', handleDragStart);
    element.addEventListener('dragend', handleDragEnd);
}

function addBeingDraggedListeners(element) {
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
    event.stopPropagation();

    if (draggedElement) {
        const dropElement = event.target.closest('.ml');
        if (dropElement) {
            if (draggedElement.classList.contains('memo')) {
                handleMemoDrop(event, dropElement);
                return;
            } else {

                if (dropElement.classList.contains('kasane') || dropElement.parentNode.classList.contains('kasane')) {
                    let parentDIV = dropElement.closest('.kasane');
                    parentDIV.appendChild(draggedElement);
                } else {
                    createKasaneDiv(draggedElement, dropElement);
                }
                socket.emit('drop', { draggedId: draggedElement.id, dropId: dropElement.id });
            }
        } else {
            console.log('no dropElement: ', dropElement);
        }
    }
}

function handleMemoDrop(event, dropElement) { // memo を重ねてオープン
    dropElement = dropElement;
    event.preventDefault();
    event.stopPropagation();

    if (dropElement.classList.contains('kasane') || dropElement.parentNode.classList.contains('kasane')) {
        let parentDIV = dropElement.closest('.kasane');
        parentDIV.appendChild(draggedElement);
    } else {
        createKasaneDiv(draggedElement, dropElement);
    }

    // メモをポストにする
    socket.emit('kasaneteOpen', draggedElement.id, dropElement.id);

    draggedElement.classList.remove('memo');

    const memoSendContainer = draggedElement.querySelector('.memoSend-container');
    // 要素が存在すれば削除
    if (memoSendContainer) { memoSendContainer.remove(); }

    draggedElement.appendChild(createActionButtons(draggedElement));
};

function changeTagName(oldElement, newTagName) {
    // 新しいタグを作成して、元の要素の属性と内容をコピー
    const newElement = document.createElement(newTagName);
    [...oldElement.attributes].forEach(attr => newElement.setAttribute(attr.name, attr.value));
    newElement.innerHTML = oldElement.innerHTML;

    // 元の要素を新しい要素で置き換える
    oldElement.parentNode.replaceChild(newElement, oldElement);

    return newElement;
}

function createKasaneDiv(draggedElement, dropElement) {
    const accordionContainer = createElement('details', 'accordion');
    messageLists.insertBefore(accordionContainer, dropElement);

    const master = changeTagName(dropElement, 'summary');
    accordionContainer.appendChild(master);

    let children = createElement('div', 'children');
    const child = changeTagName(draggedElement, 'p');
    child.classList.add('child');
    console.log('child: ', child);

    children.appendChild(child);
    console.log('children: ', children);
    accordionContainer.appendChild(children);

    const childCount = accordionContainer.children.length; // 要素ノードの数を取得

    accordionContainer.style.borderLeft = `${(childCount - 1) * 2}px solid #EF7D3C`;

    draggedElement.style.visibility = '';
    master.style.border = "";
    master.style.color = '';
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

function buildMlElement(message) { // chat
    const item = buildMlBaseStructure(message, message.name);

    // (2) case survey => options and votes
    createSurveyContainer(message, item);

    // 3 buttons
    const buttons = createActionButtons(message);
    item.appendChild(buttons);

    return item;
}

function createSurveyContainer(message, item) {
    if (message.question) {
        const surveyContainer = makeSurveyContainerElement(message);
        item.appendChild(surveyContainer);
    }
}

function buildMlBaseStructure(data, nameText) {
    const item = createElement('div', 'ml');

    const userNameTimeMsg = createNameTimeMsg(data, nameText);
    item.appendChild(userNameTimeMsg);

    return item;
}

function createNameTimeMsg(message, nameText = message.name) {
    const userNameTimeMsg = createElement('div', 'userName-time-msg');
    const userName_time = createElement('div', 'userName-time');
    const userName = createElement('span', 'userName', nameText);
    const time = createElement('span', 'time', message.createdAt);

    userName_time.append(userName, time);
    userNameTimeMsg.appendChild(userName_time);

    const message_div = createElement('div', 'message-text', message.question || message.msg);
    userNameTimeMsg.appendChild(message_div);

    return userNameTimeMsg;
}

// (2)
function makeSurveyContainerElement(message) {
    const surveyContainer = createElement('div', 'survey-container');

    for (let i = 0; i < message.options.length; i++) {
        const surveyOption = createElement('button', 'survey-option', message.options[i] || '');

        surveyOption.addEventListener('click', () => {
            // console.log(i);
            socket.emit('survey', message._id, i);
        });

        console.log('message.voteSums: ', message.voteSums);

        const surveyNum = createElement('span', 'survey-num-' + (i), `${message.voteSums[i]}`);

        surveyContainer.appendChild(surveyOption);
        surveyContainer.appendChild(surveyNum);
    }
    return surveyContainer;
}

// 3 buttons
function createActionButtons(message) {
    const buttons = createElement('div', 'buttons');
    // ['up', 'down', 'bookmark'].forEach(eventType => {
    ['bookmark'].forEach(eventType => {
        buttons.appendChild(makeActionButtonContainer(eventType, message));
    });
    return buttons;
}

function makeActionButtonContainer(eventType, message) {

    const eventData = {
        // up: { className: 'up-container', emoji: '⇧', count: message.ups || 0 },
        // down: { className: 'down-container', emoji: '⇩', count: message.downs || 0 },
        bookmark: { className: 'bookmark-container', emoji: '☆', count: message.bookmarks || 0 }
    }[eventType];

    const container = createElement('div', eventData.className);
    const button = createElement('button', 'actionButton', eventData.emoji);
    const count = createElement('span', `${eventType}-count`, eventData.count);

    button.addEventListener('click', e => {
        button.classList.toggle("active");
        console.log('button.classList: ', button.classList);
        socket.emit('event', eventType, message._id);
    });

    container.appendChild(button);
    container.appendChild(count);
    return container;
}

function enableDragDrop(item) {
    item.setAttribute('draggable', 'true');
    item.classList.add('draggable');
    addDragListeners(item);
    addBeingDraggedListeners(item);
}

function appendChild_IdScroll(item, message = {}, shouldScroll = true) {
    messageLists.appendChild(item);
    if (message._id) { item.id = message._id; }
    if (shouldScroll) { window.scrollTo(0, document.body.scrollHeight); }
}

input.addEventListener('focus', () => {
    input.style.outlineColor = checkBox.checked ? 'rgb(56, 92, 168)' : 'rgb(32, 178, 170)';
});

checkBox.addEventListener('change', toggleMemoMode);

function toggleMemoMode() {
    if (checkBox.checked) {
        input.placeholder = 'チャット みんなに表示';
        input.style.outlineColor = 'rgb(56, 92, 168)';
        formButton.textContent = 'Send';
        formButton.classList.add('chatButton');
    } else {
        input.placeholder = 'メモ あなただけに表示';
        input.style.outlineColor = 'rgb(32, 178, 170)';
        formButton.textContent = 'Memo';
        formButton.classList.remove('chatButton');
    }
}

form.addEventListener('submit', (event) => {
    event.preventDefault();

    const isChecked = checkBox.checked;
    if (isChecked) {
        // 連続した2つのコロン "::" が2つ以上あるかを判別する
        if ((input.value.match(/::/g) || []).length >= 2) {
            console.log("'::'が含まれるアンケート");
            socket.emit('submitSurvey', input.value);
        } else {
            console.log("'::' が2つ以上含まれない普通のチャット");
            socket.emit('chat message', input.value);
        }
    } else {
        socket.emit('personal memo', input.value);
    }
    input.value = '';
});

function checkIsBefore(target, compare) {
    const targetDate = new Date(target);
    const compareDate = new Date(compare);
    return targetDate < compareDate;
}
