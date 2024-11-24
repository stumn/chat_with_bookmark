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

let dropElement;

// ログイン
const myName = prompt("名前を入力してください", "");

if (!myName) {
    alert('名前が入力されていません。再読み込み後、入力してください。');
    location.reload();
} else {
    const errors = []; // エラーをまとめて管理

    if (myName.length > 10) { errors.push('名前が長すぎます（10文字以内で入力してください）。'); }
    if (myName.includes(' ') || myName.includes('　')) { errors.push('名前にスペースが含まれています。'); }
    if (/[^a-zA-Z0-9\u3040-\u30FF\u4E00-\u9FFF\-_\uFF66-\uFF9F]/.test(myName)) {
        errors.push('名前に使用できない記号が含まれています。記号を除いて入力してください。');
    }

    if (errors.length > 0) {
        alert(errors.join('\n') + '\n再読み込み後、修正してください。');
        location.reload();
    }
}

// ログイン情報をサーバに送信
socket.emit('sign-up', myName);
$('sign-up-name').textContent = 'あなた： ' + myName;

// ドキュメントページへのリンク
let docURL;
socket.on('randomString', (receivedString) => {
    docURL = `/${receivedString}/${myName}/document`;
});

function OpenDocumentWindow() {
    docURL
        ? window.open(docURL, '_blank')
        : alert('しばらくしてからもう一度お試しください。');
}

// 同時参加者数
socket.on('onlineUsers', (onlines) => {
    $('onlines').textContent = '接続中: ' + onlines.length + '人';
});

// 伏せカードオープン通知
const openCardStatus = new Map();
setInterval(updateStatus, 1000); // update

socket.on('notification', (data) => {
    openCardStatus.set(data, new Date());
});

function updateStatus() {
    let name, difference, text;

    for (let [data, date] of openCardStatus) {
        if (Date.now() - date > 60000) { openCardStatus.delete(data); } // 60sec passed => delete notification

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
    // window.scrollTo(0, document.body.scrollHeight);
});

// ソケットイベントと対応するハンドラをマッピング
const socketEventHandlers = {
    myChat: handleMyChat,                 // 自分のチャット・アンケート（ドラッグ可能）
    chatLogs: handleChatLogs,             // 他の人のチャット・アンケート（ドラッグ不可）

    memoLogs: handleMemoLogs,             // 自分メモ（ドラッグ可能）

    myOpenCard: processMyOpenCard,        // 自分のメモボタン公開（ドラッグ可能）
    downCard: processDownCard,            // 他の人のメモボタン公開（ドラッグ不可）

    myKasaneOpen: handleMyKasaneOpen,     // ドロップ自分の重ねてオープン
    kasaneOpen: handleKasaneOpen,         // ドロップ他の人の重ねてオープン

    updateVote: handleUpdateVote,         // 投票を受信
    bookmark: updateBookmark,             // bookmark を受信

    dragstart: handleDragStart,           // 他の人が D & D をしている（ドラッグ開始）
    dragend: handleDragEnd,               // 他の人が D & D をしている（ドラッグ終了）
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
            console.log('chatdesu', pastElement);
            pastElement.childPostIds.length > 0
                ? addAccordionLog(pastElement, stackLogs) // 子分がいる
                : addSimpleLog(pastElement); // 子分がいない
        } else {
            console.log('memodesu', pastElement);
            handleMemoLogs(pastElement, false);
        }
    });
}

function addSimpleLog(pastElement) {// 子分がいない過去ログ
    const item = buildMlElement(pastElement);
    if (pastElement.memoId) { item.classList.add('downCard', 'visible'); }
    addBeingDraggedListeners(item);
    appendChildWithIdAndScroll(item, pastElement, true);
}

function addAccordionLog(pastElement, stackLogs) {// 子分がいる過去ログ
    const detailsContainer = createDetailsContainer(stackLogs, pastElement);
    addBeingDraggedListeners(detailsContainer);
    messageLists.appendChild(detailsContainer);
}

function createDetailsContainer(stackLogs, pastElement) {
    // <details .ml>
    const detailsContainer = createHtmlElement('details', 'accordion');

    // <summary .ml>
    const parentSummary = createParentSummary(pastElement);
    detailsContainer.appendChild(parentSummary);

    // <div .children> <p>child</p> </div>
    const children = createChildrenContainer(stackLogs, pastElement);
    detailsContainer.appendChild(children);

    const kobuns = filterKobuns(stackLogs, pastElement.childPostIds);
    detailsContainer.style.borderLeft = `${kobuns.length * 2}px solid #EF7D3C`;
    return detailsContainer;
}

function createParentSummary(pastElement) { // <summary .ml>
    const parentSummary = createHtmlElement('summary');
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
    const children = createHtmlElement('div', 'children');
    const kobuns = filterKobuns(stackLogs, pastElement.childPostIds);

    kobuns.forEach(kobun => {
        const child = createChildElement(kobun); // <p .child>
        children.appendChild(child);
    });

    return children;
}

function createChildElement(kobun) { // <p .child>
    const child = createHtmlElement('p', 'child');
    child.appendChild(createNameTimeMsg(kobun));
    createSurveyContainer(kobun, child);
    child.appendChild(createActionButtons(kobun));
    child.id = kobun.id;
    return child;
}

// 自分のチャット
function handleMyChat(post) { // MyChat
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
function handleMemoLogs(memo, shouldScroll = true) {
    const item = buildMlBaseStructure(memo, '[memo]');
    item.classList.add('memo');
    const memoSendContainer = buildMemoSendContainer(memo);
    item.appendChild(memoSendContainer);

    enableDragAndDrop(item);
    appendChildWithIdAndScroll(item, memo, shouldScroll);
}

// 自分のメモボタン公開
function processMyOpenCard(msg) {
    processDownCard(msg, true);
}

// 他の人のメモボタン公開
function processDownCard(msg, isMine = false) {
    const opencardCreatedAt = msg.memoCreatedAt;
    const timeSpanArray = document.querySelectorAll("#messageLists div span.time");

    for (let i = 0; i < timeSpanArray.length; i++) {
        const compareCreatedAt = timeSpanArray[i].textContent;
        const isBefore = checkIsBefore(opencardCreatedAt, compareCreatedAt);
        console.log('isBefore: ', isBefore);

        if (isBefore) {// メモ作成時の時間が入る場所がある
            console.log('isBefore: ', isBefore);
            insertDownCard(msg, timeSpanArray, i, false, isMine);
            return;
        }

        if (i === timeSpanArray.length - 1) { // 最新
            console.log('isBefore 最新');
            insertDownCard(msg, timeSpanArray, i, true, isMine);
            return;
        }
    }
}

function handleMyKasaneOpen(data) { // 自分の重ねてオープン
    const post = data.postSet;
    const memoId = post.memoId;
    const dropId = data.dropId;

    const dropElement = $(dropId);
    const detailsContainer = createHtmlElement('details', 'accordion');
    messageLists.insertBefore(detailsContainer, dropElement);

    const parentSummary = changeTagName(dropElement, 'summary');
    detailsContainer.appendChild(parentSummary);

    let children = createHtmlElement('div', 'children');
    const draggedElement = buildMlElement(post);
    draggedElement.id = post.id;
    console.log('draggedElement: ', draggedElement);

    const child = changeTagName(draggedElement, 'p');
    console.log('child', child);
    const memo = $(memoId);
    memo.remove();

    child.classList.add('child');
    child.style.visibility = '';
    console.log('child: ', child);

    children.appendChild(child);
    console.log('children: ', children);
    detailsContainer.appendChild(children);

    const childCount = detailsContainer.children.length; // 要素ノードの数を取得

    detailsContainer.style.borderLeft = `${(childCount - 1) * 2}px solid #EF7D3C`;

    draggedElement.style.visibility = '';
    parentSummary.style.border = "";
    parentSummary.style.color = '';
}

function handleKasaneOpen(data) { // 他の人の重ねてオープン
}

function buildMemoSendContainer(memo) {
    const memoSendContainer = createHtmlElement('div', 'memoSend-container');

    const memoSendButton = createHtmlElement('button', 'memoSendButton', '🚀');
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
        console.log('voteSum: ', voteSum);
        console.log('i: ', i);
        const surveyNum = item.querySelector(`.survey-num.option${i}`);
        console.log('surveyNum: ', surveyNum);
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

// 個別ハンドラの定義
function handleDragStart(draggedId) {
    updateElementBorder(draggedId, '3px dotted');
}

function handleDragEnd(draggedId) {
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
    event.preventDefault();
    event.stopPropagation();
    const dropElement = event.target.closest('.ml');

    if (!draggedElement) { console.log('no draggedElement'); return; }
    if (!dropElement) { console.log('no dropElement'); return; }

    draggedElement.classList.contains('memo')
        ? undercoverDrop(event, dropElement)
        : overtDrop(dropElement);

}

// chat / opencard を重ねる
function overtDrop(dropElement) {
    const parentDIV = dropElement.closest('.kasane');

    dropElement.classList.contains('kasane') || parentDIV
        ? parentDIV.appendChild(draggedElement)
        : createKasaneDiv(draggedElement, dropElement);

    const twoID = { draggedId: draggedElement.id, dropId: dropElement.id };
    socket.emit('drop', twoID);
}

// memo を重ねてオープン
function undercoverDrop(event, dropElement) {
    console.log('draggedElement: ', draggedElement.id);
    console.log('dropElement: ', dropElement.id);

    socket.emit('undercoverDrop', draggedElement.id, dropElement.id); // サーバでメモをポストにする
};

function changeTagName(oldElement, newTagName) {
    console.log('oldElement', oldElement);
    // 新しいタグを作成して、元の要素の属性と内容をコピー
    const newElement = document.createElement(newTagName);
    [...oldElement.attributes].forEach(attr => {
        if (attr.name !== 'class' && attr.name !== 'draggable') {
            newElement.setAttribute(attr.name, attr.value);
        }
    });
    newElement.innerHTML = oldElement.innerHTML;

    // 元の要素を新しい要素で置き換える
    oldElement.parentNode
        ? oldElement.parentNode.replaceChild(newElement, oldElement)
        : console.log('newElement: ', newElement);
    return newElement;
}

// 既に開いているものを重ねる
function createKasaneDiv(draggedElement, dropElement) {
    const detailsContainer = createHtmlElement('details', 'accordion');
    messageLists.insertBefore(detailsContainer, dropElement);

    const parentSummary = changeTagName(dropElement, 'summary');
    detailsContainer.appendChild(parentSummary);

    const children = createHtmlElement('div', 'children');

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

function createHtmlElement(tag, className = '', text = '') {
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
    const item = createHtmlElement('div', 'ml');
    const userNameTimeMsg = createNameTimeMsg(msg, nameText);
    item.appendChild(userNameTimeMsg);
    return item;
}

function createNameTimeMsg(message, nameText = message.name) {
    const userNameTimeMsg = createHtmlElement('div', 'userName-time-msg');
    const userName_time = createHtmlElement('div', 'userName-time');
    const userName = createHtmlElement('span', 'userName', nameText);

    console.log('message.memoCreatedAt: ', message.memoCreatedAt);
    console.log('message.createdAt: ', message.createdAt);
    const timeData = message.memoCreatedAt ? message.memoCreatedAt : message.createdAt;
    console.log('timeData: ', timeData);
    const time = createHtmlElement('span', 'time', timeData);

    userName_time.append(userName, time);
    userNameTimeMsg.appendChild(userName_time);

    const message_div = createHtmlElement('div', 'message-text', message.msg);
    userNameTimeMsg.appendChild(message_div);

    return userNameTimeMsg;
}

function makeSurveyContainerElement(message) {
    const surveyContainer = createHtmlElement('div', 'survey-container');
    for (let i = 0; i < message.options.length; i++) {
        const surveyOption = createHtmlElement('button', 'survey-option', message.options[i] || '');
        surveyOption.addEventListener('click', () => {
            socket.emit('survey', message.id, i);
        });
        const surveyNum = createHtmlElement('span', 'survey-num', `${message.voteSums[i]}`);
        surveyNum.classList.add(`option${i}`);
        surveyContainer.append(surveyOption, surveyNum);
    }
    return surveyContainer;
}
function createActionButtons(message) {
    const buttons = createHtmlElement('div', 'buttons');
    buttons.appendChild(makeBookmarkButton(message));
    return buttons;
}

function makeBookmarkButton(message) {
    const container = createHtmlElement('div', 'bookmark-container');
    const button = createHtmlElement('button', 'actionButton', '☆');
    const count = createHtmlElement('span', 'bookmark-count', message.bookmarks || 0);

    button.addEventListener('click', () => {
        button.classList.toggle("active");
        button.disabled = true;
        button.textContent = '★';
        socket.emit('bookmark', message.id);
    });

    container.append(button, count);
    return container;
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
    console.log('target: ', target);
    console.log('compareCreatedAt: ', compareCreatedAt);
    const targetDate = new Date(target);
    const compareCreatedAtDate = new Date(compareCreatedAt);
    return targetDate < compareCreatedAtDate;
}
