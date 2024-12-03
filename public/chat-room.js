const socket = io();

// html要素の取得
function $(id) {
    if (!id) { console.error('id is not defined'); }
    const element = document.getElementById(id);
    if (!element) { console.error(`Element with id "${id}" not found`); }
    return element;
}

const messageLists = $('messageLists');
const notification = $('notification');
const form = $('form');
const input = $('input');
const formButton = $('formButton');
const checkBox = $('checkBox');
const docsButton = $('docsButton');

let dropElement;

// ログイン
document.addEventListener('DOMContentLoaded', () => {
    const pathname = window.location.pathname;
    const loginName = decodeURIComponent(pathname.split('/')[2]);
    const randomString = decodeURIComponent(pathname.split('/')[1]);
    const docURL = `/${randomString}/${loginName}/document`;
    docsButton.addEventListener('click', e => {
        docURL
            ? window.location.href = docURL
            : alert('しばらくしてからもう一度お試しください。');
    });

    // ログイン情報をサーバに送信
    const loginData = { loginName, randomString };
    socket.emit('sign-up', loginData);
    $('sign-up-name').textContent = 'あなた： ' + loginName;
});

// 同時参加者数
socket.on('onlineUsers', (onlines) => {
    $('onlines').textContent = '接続中: ' + onlines.length + '人';
});

// 伏せカードオープン通知
const openCardStatus = new Map();
setInterval(updateStatus, 1000); // update

socket.on('notification', (data) => {
    console.log('notification: ', data);
    openCardStatus.set(data, data.nowTime);
    console.log('openCardStatus: ', openCardStatus);
});

function updateStatus() {
    let name, difference, text;

    for (let [data, date] of openCardStatus) {
        const elapsedTime = Date.now() - date;
        // console.log('elapsedTime: ', elapsedTime);
        if (elapsedTime > 20000) { openCardStatus.delete(data); } // 60sec passed => delete notification

        name = data.name;
        difference = Math.abs(data.difference);
        const second = Math.round(difference / 1000);
        text = second < 0 ? '' : `${name}さんが${second}秒前のメモを公開しました`;

        if (difference > 60000) { // case: released memo was saved more than 60sec ago.
            const minute = Math.round(difference / 60000);
            text = `${name}さんが${minute}分前のメモを公開しました`;
        }
    }
    notification.textContent = openCardStatus.size > 0 ? text : '';
}

function GoToTheOpenCard() {
    // 目当ての投稿へひとっとび window.scrollTo(0, document.body.scrollHeight);
    // ～秒前∧名前∧伏せカード で探せる
}

// 過去ログ受信
socket.on('pastLogs', ({ pastLogs, stackLogs }) => {
    handlePastLogs(pastLogs, stackLogs);
    window.scrollTo(0, document.body.scrollHeight);
});

// ソケットイベントと対応するハンドラをマッピング
const socketEventHandlers = {
    myChat: handleMyChat,                 // 自分のチャット・アンケート（ドラッグ可能）
    chatLogs: handleChatLogs,             // 他の人のチャット・アンケート

    memoLogs: handleMemoLogs,             // 自分メモ（ドラッグ可能）

    myOpenCard: processMyOpenCard,        // 自分のメモボタン公開（ドラッグ可能）
    downCard: processDownCard,            // 他の人のメモボタン公開

    kasaneMemoOpen: handleKasaneMemoOpen,     // ドロップ自分の重ねてオープン
    broadcastDrop: handleBroadcastDrop,       // ドロップ他の人の重ねてオープン

    updateVote: handleUpdateVote,         // 投票を受信
    bookmark: updateBookmark,             // bookmark を受信

    dragstart: handleBroadcastDragStart,           // 他の人が D & D をしている（ドラッグ開始）
    dragend: handleBroadcastDragEnd,               // 他の人が D & D をしている（ドラッグ終了）
};

// ソケットイベントの登録を一括で行う
Object.entries(socketEventHandlers).forEach(([eventName, handler]) => {
    socket.on(eventName, handler);
});

// < アラート
socket.on('alert', (alertMsg) => {
    alert(alertMsg);
});

// < ダイアログ >
socket.on('dialog_to_html', (dialogMsg) => {
    socket.emit('dialog_to_js', confirm(dialogMsg) ? true : false);
});

// ここからハンドラ関数定義

// 過去ログ
function handlePastLogs(pastLogs, stackLogs) {
    pastLogs.forEach((pastElement) => {
        if (pastElement.options) {
            pastElement.childPostIds.length > 0
                ? addAccordionLog(pastElement, stackLogs) // 子分がいる
                : addSimpleLog(pastElement); // 子分がいない
        } else {
            handleMemoLogs(pastElement, false);
        }
    });
}

function addAccordionLog(pastElement, stackLogs) {// 子分がいる過去ログ
    const detailsContainer = createDetailsContainer(stackLogs, pastElement);
    addBeingDraggedListeners(detailsContainer);
    messageLists.appendChild(detailsContainer);
}

function addSimpleLog(pastElement) {// 子分がいない過去ログ
    const item = buildMlElement(pastElement);
    if (pastElement.memoId) { item.classList.add('downCard', 'visible'); }
    addBeingDraggedListeners(item);
    appendChildWithIdAndScroll(item, pastElement, true);
}

function createDetailsContainer(stackLogs, pastElement) {
    // <details .ml>
    const detailsContainer = createHTMLelement('details', 'accordion');
    detailsContainer.classList.add('ml');

    // <summary .ml>
    const parentSummary = createParentSummary(pastElement);
    detailsContainer.appendChild(parentSummary);

    // <div .children> <p>child</p> </div>
    const children = createChildrenContainer(stackLogs, pastElement);
    detailsContainer.appendChild(children);

    const kobuns = filterKobuns(stackLogs, pastElement.childPostIds);
    detailsContainer.style.borderLeft = `${kobuns.length * 2}px solid #EF7D3C`; // 色が付くときと付かない時がある？
    return detailsContainer;
}

function createParentSummary(pastElement) { // <summary .ml>
    const parentSummary = createHTMLelement('summary');
    parentSummary.appendChild(createNameTimeMsg(pastElement));
    createSurveyContainer(pastElement, parentSummary);
    parentSummary.appendChild(createActionButtons(pastElement));

    if (pastElement.isOpenCard) {
        parentSummary.classList.add('downCard', 'visible');
    }
    appendChildWithIdAndScroll(parentSummary, pastElement, false);

    return parentSummary;
}

function filterKobuns(stackLogs, childPostIds) {
    return stackLogs.filter(stackElement => childPostIds.includes(stackElement.id));
}

function createChildrenContainer(stackLogs, pastElement) { // <div .children>
    const children = createHTMLelement('div', 'children');
    const kobuns = filterKobuns(stackLogs, pastElement.childPostIds);

    kobuns.forEach(kobun => {
        const child = createChildElement(kobun); // <p .child>
        children.appendChild(child);
    });

    return children;
}

function createChildElement(kobun) { // <p .child>
    const child = createHTMLelement('p', 'child');
    child.appendChild(createNameTimeMsg(kobun));
    createSurveyContainer(kobun, child);
    child.appendChild(createActionButtons(kobun));
    child.id = kobun.id;
    return child;
}

// 自分のチャット
function handleMyChat(post) { // MyChat ドラッグ可能
    const item = buildMlElement(post);
    enableDragAndDrop(item);
    appendChildWithIdAndScroll(item, post, true);
}

// 他の人のチャット
function handleChatLogs(post) { // ChatLogs
    const item = buildMlElement(post);
    addBeingDraggedListeners(item);
    appendChildWithIdAndScroll(item, post, true);
}

// 自分のメモ
function handleMemoLogs(memo, shouldScroll = true) { // ドラッグ可能
    const item = buildMlBaseStructure(memo, '[memo]');
    item.classList.add('memo');
    const memoSendContainer = buildMemoSendContainer(memo);
    item.appendChild(memoSendContainer);

    enableDragAndDrop(item);
    appendChildWithIdAndScroll(item, memo, shouldScroll);
}

// 自分のメモボタン公開
function processMyOpenCard(msg) { // ドラッグ可能
    processDownCard(msg, true);
}

// メモボタン公開(共通)
function processDownCard(msg, isMine = false) {
    const opencardCreatedAt = msg.memoCreatedAt;
    const timeSpanArray = document.querySelectorAll("#messageLists div span.time");

    for (let i = 0; i < timeSpanArray.length; i++) {
        const compareCreatedAt = timeSpanArray[i].textContent;
        const isBefore = checkIsBefore(opencardCreatedAt, compareCreatedAt);

        if (isBefore) {// メモ作成時の時間が入る場所がある
            insertDownCard(msg, timeSpanArray, i, false, isMine);
            return;
        }
        if (i === timeSpanArray.length - 1) { // 最新
            insertDownCard(msg, timeSpanArray, i, true, isMine);
            return;
        }
    }
}

function handleKasaneMemoOpen(data) {
    console.log('handleKasaneMemoOpen: ', data);
    // まず公開したメモをチャット投稿として表示
    const post = data.postSet;
    const item = buildMlElement(post);
    appendChildWithIdAndScroll(item, post, false);
    console.log('item: ', item);

    // ドロップ先の要素を取得
    const dropElement = $(data.dropId);
    const parentDIV = dropElement.closest('.accordion');
    if (parentDIV) {
        addChildElement(parentDIV, item);

        const detailsContainer = $(data.postSet.id).closest('.accordion');
        const childCount = detailsContainer.children.length; // 要素ノードの数を取得
        detailsContainer.style.borderLeft = `${(childCount - 1) * 2}px solid #EF7D3C`;

        const parentSummary = parentDIV.querySelector('summary');
        item.style.visibility = '';
        parentSummary.style.border = "";
        parentSummary.style.color = '';
    } else {
        createKasaneDiv(item, dropElement);
    }

    // 元メモを履歴欄から削除
    const memoId = post.memoId;
    const memo = $(memoId);
    if (memo) { memo.remove(); }
}

function handleBroadcastDrop(data) {
    console.log('handleBroadcastDrop: ', data);
    const draggedElement = $(data.draggedId);
    const dropElement = $(data.dropId);
    const parentDIV = dropElement.closest('.accordion');
    if (parentDIV) {
        addChildElement(parentDIV, draggedElement);

        const detailsContainer = $(data.postSet.id).closest('.accordion');
        const childCount = detailsContainer.children.length; // 要素ノードの数を取得
        detailsContainer.style.borderLeft = `${(childCount - 1) * 2}px solid #EF7D3C`;

        const parentSummary = parentDIV.querySelector('summary');
        draggedElement.style.visibility = '';
        parentSummary.style.border = "";
        parentSummary.style.color = '';
    } else {
        createKasaneDiv(draggedElement, dropElement);
    }
}

function buildMemoSendContainer(memo) {
    const memoSendContainer = createHTMLelement('div', 'memoSend-container');

    const memoSendButton = createHTMLelement('button', 'memoSendButton', '🚀');
    memoSendButton.addEventListener('click', e => {
        memoSendButton.classList.add("active");
        e.preventDefault();
        socket.emit('revealMemo', memo);
        memoSendButton.disabled = true;
        const memoDiv = memoSendButton.closest('.memo');
        memoDiv.classList.add('translucent');
        memoDiv.classList.remove('draggable');
        memoDiv.attributes.removeNamedItem('draggable');
    });

    memoSendContainer.appendChild(memoSendButton);
    return memoSendContainer;
}


function insertDownCard(msg, timeSpanArray, index, isLatest = false, isMine) {
    const item = buildMlElement(msg);

    isMine ? enableDragAndDrop(item) : addBeingDraggedListeners(item);

    isLatest
        ? appendChildWithIdAndScroll(item, msg, true) // 最新の場合
        : insertItemBeforeParent(timeSpanArray, index, item);

    item.id = msg.id;
    item.classList.add('ml', 'downCard', 'visible');
}

function insertItemBeforeParent(timeSpanArray, index, item) {
    let parentDIV = timeSpanArray[index].closest('.ml');
    if (parentDIV.parentNode.classList.contains('kasane')) {
        parentDIV = parentDIV.parentNode;
    }
    messageLists.insertBefore(item, parentDIV);
}

function handleUpdateVote(voteData) {
    const item = $(voteData.id);
    voteData.voteSums.forEach((voteSum, i) => {
        const surveyNum = item.querySelector(`.survey-num.option${i}`);
        surveyNum.textContent = voteSum;
    });
}

function updateBookmark(data) {
    const item = $(data.id);
    if (item) {
        const countElement = item.querySelector('.bookmark-container span');
        if (countElement) { countElement.textContent = data.count; }
    }
}

function handleBroadcastDragStart(draggedId) {
    updateElementBorder(draggedId, '3px dotted');
}

function handleBroadcastDragEnd(draggedId) {
    updateElementBorder(draggedId, '');
}

function updateElementBorder(elementId, borderStyle) {
    const element = $(elementId);
    if (element) { element.style.border = borderStyle; }
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
    element.addEventListener('drop', handleDrop);
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
    event.preventDefault();
    this.style.border = '3px solid';
    this.style.color = '#227B94';
}

function handleDragLeave(event) {
    this.style.border = ""; // Reset visual feedback
    this.style.color = '';
}

function handleDrop(event) {
    this.style.border = ""; // Reset visual feedback
    this.style.color = '';

    event.preventDefault();
    event.stopPropagation();
    const dropElement = event.target.closest('.ml');

    if (!draggedElement) { console.log('no draggedElement'); return; }
    if (!dropElement) { console.log('no dropElement'); return; }

    draggedElement.classList.contains('memo')
        ? undisclosedMemoDrop(event, dropElement)
        : overtDrop(dropElement);
}

// chat / opencard を重ねる
function overtDrop(dropElement) {
    console.log('start overtDrop');
    const parentDIV = dropElement.closest('.accordion');
    let dropId;
    if (parentDIV) {
        addChildElement(parentDIV, draggedElement);
        const summaryElement = parentDIV.querySelector('summary');
        dropId = summaryElement.id;
    } else {
        createKasaneDiv(draggedElement, dropElement);
        dropId = dropElement.id;
    }
    const twoID = { draggedId: draggedElement.id, dropId: dropId };
    socket.emit('drop', twoID);
    console.log('end overtDrop');
}

// memo を重ねてオープン
function undisclosedMemoDrop(event, dropElement) { // dropElement: ml / detailsContainer
    const parentDIV = dropElement.closest('.accordion');
    const dropId = parentDIV ? parentDIV.querySelector('summary').id : dropElement.id;
    socket.emit('undisclosedMemoDrop', draggedElement.id, dropId); // サーバでメモをポストにする
};

function changeTagName(oldElement, newTagName) {
    const newElement = document.createElement(newTagName);

    [...oldElement.attributes].forEach(attr => {
        if (attr.name !== 'class' && attr.name !== 'draggable') {
            newElement.setAttribute(attr.name, attr.value);
        }
    });

    // 子ノードをコピー
    while (oldElement.firstChild) {
        newElement.appendChild(oldElement.firstChild);
    }

    // 元の要素を新しい要素で置き換える
    oldElement.parentNode
        ? oldElement.parentNode.replaceChild(newElement, oldElement)
        : console.log('newElement: ', newElement);

    return newElement;
}

// 既に開いているものを重ねる
function createKasaneDiv(draggedElement, dropElement) {
    const detailsContainer = createHTMLelement('details', 'accordion');
    detailsContainer.classList.add('ml');
    addBeingDraggedListeners(detailsContainer);
    messageLists.insertBefore(detailsContainer, dropElement);

    const parentSummary = changeTagName(dropElement, 'summary');
    detailsContainer.appendChild(parentSummary);

    const children = createHTMLelement('div', 'children');

    const child = changeTagName(draggedElement, 'p');
    child.classList.add('child');
    child.style.visibility = '';

    children.appendChild(child);
    detailsContainer.appendChild(children);

    const childCount = detailsContainer.children.length; // 要素ノードの数を取得
    detailsContainer.style.borderLeft = `${(childCount - 1) * 2}px solid #EF7D3C`;

    draggedElement.style.visibility = '';
    parentSummary.style.border = "";
    parentSummary.style.color = '';
}

function addChildElement(parentDIV, draggedElement) {
    const childrenContainer = parentDIV.querySelector('.children');
    const child = changeTagName(draggedElement, 'p');
    child.classList.add('child');
    child.style.visibility = '';
    childrenContainer.appendChild(child);
}

function createHTMLelement(tag, className = '', text = '') {
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
    createSurveyContainer(message, item);
    item.appendChild(createActionButtons(message));
    return item;
}

function createSurveyContainer(message, item) {
    if (message.options) {
        const surveyContainer = makeSurveyContainerElement(message);
        item.appendChild(surveyContainer);
    }
}

function buildMlBaseStructure(msg, nameText) {
    const item = createHTMLelement('div', 'ml');
    const userNameTimeMsg = createNameTimeMsg(msg, nameText);
    item.appendChild(userNameTimeMsg);
    return item;
}

function createNameTimeMsg(message, nameText = message.name) {
    const userNameTimeMsg = createHTMLelement('div', 'userName-time-msg');
    const userName_time = createHTMLelement('div', 'userName-time');
    const userName = createHTMLelement('span', 'userName', nameText);

    const timeData = message.memoCreatedAt ? message.memoCreatedAt : message.createdAt;
    // console.log('timeData: ', message.memoCreatedAt ? 'memoCreatedAt' : 'createdAt');
    const time = createHTMLelement('span', 'time', organizeCreatedAt(timeData));

    userName_time.append(userName, time);
    userNameTimeMsg.appendChild(userName_time);

    const message_div = createHTMLelement('div', 'message-text', message.msg);
    userNameTimeMsg.appendChild(message_div);

    return userNameTimeMsg;
}

function makeSurveyContainerElement(message) {
    const surveyContainer = createHTMLelement('div', 'survey-container');
    for (let i = 0; i < message.options.length; i++) {
        const surveyOption = createHTMLelement('button', 'survey-option', message.options[i] || '');
        surveyOption.addEventListener('click', () => {
            socket.emit('survey', message.id, i);
        });
        const surveyNum = createHTMLelement('span', 'survey-num', `${message.voteSums[i]}`);
        surveyNum.classList.add(`option${i}`);
        surveyContainer.append(surveyOption, surveyNum);
    }
    return surveyContainer;
}
function createActionButtons(message) {
    const buttons = createHTMLelement('div', 'buttons');
    const bookmarkButton = makeBookmarkButton(message);

    if (message.isBookmarked) {
        bookmarkButton.classList.add("active");
        bookmarkButton.textContent = '★';
    }
    buttons.appendChild(bookmarkButton);
    return buttons;
}

function makeBookmarkButton(message) {
    const container = createHTMLelement('div', 'bookmark-container');
    const button = createHTMLelement('button', 'actionButton', '☆');
    const count = createHTMLelement('span', 'bookmark-count', message.bookmarks || 0);

    setupBookmarkClickHandler(button, message);

    container.append(button, count);
    return container;
}

function setupBookmarkClickHandler(button, message) {
    button.addEventListener('click', (event) => {
        event.stopPropagation(); // 親や子への伝播を防ぐ
        console.log('pushed bookmark button', 'message.id: ', message.id);
        console.log('event.target: ', event.target);

        button.classList.toggle("active");
        const isActive = button.classList.contains("active");
        button.textContent = isActive ? '★' : '☆';
        const data = { id: message.id, active: isActive };
        socket.emit('bookmark', data);
    });
}

function enableDragAndDrop(item) {
    item.setAttribute('draggable', 'true');
    item.classList.add('draggable');
    addDragListeners(item);
    addBeingDraggedListeners(item);
}

function appendChildWithIdAndScroll(item, message = {}, shouldScroll = true) {
    messageLists.appendChild(item);
    message.id ? item.id = message.id : console.log('message.id is not found', message.msg);
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
    checkBox.checked
        ? socket.emit('chat message', input.value)
        : socket.emit('personal memo', input.value);
    input.value = '';
});

function checkIsBefore(target, compareCreatedAt) {
    const targetDate = new Date(target);
    const compareCreatedAtDate = new Date(compareCreatedAt);
    return targetDate < compareCreatedAtDate;
}

function organizeCreatedAt(createdAt) {
    const UTCdate = new Date(createdAt);
    if (isNaN(UTCdate.getTime())) {
        console.error("無効な日時:", createdAt);
        return "Invalid Date";
    }
    return UTCdate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}