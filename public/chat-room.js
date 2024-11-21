const socket = io();

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

// プロンプト　ログインで名前を入力・サーバーに送信
const myName = prompt("名前を入力してください", "");
if (!myName) {
    alert('名前が入力されていません。再読み込み後、入力してください。');
    location.reload();
}
// 記号を含む場合は、変更してもらう（記号を含まないように指示しておく）

socket.emit('sign-up', myName);
$('sign-up-name').textContent = 'あなた： ' + myName;

let docURL;
socket.on('randomString', (receivedString) => {
    docURL = `/${receivedString}/${myName}/document`;
});

function OpenDocumentWindow() {
    docURL
        ? window.open(docURL, '_blank')
        : alert('しばらくしてからもう一度お試しください。');
}

// オンラインメンバー
socket.on('onlineUsers', (onlines) => {
    $('onlines').textContent = '接続中: ' + onlines.length + '人';
});

// notification
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

// エキサイト機能
// socket.on('memoCount', (memoCount) => {
//     updateHeaderColorBasedOnMemoCount(memoCount);
// });

// 自分のチャット・アンケート（ドラッグ可能）
socket.on('myChat', (post) => {
    handleMyChat(post);
});

// 他の人のチャット・アンケート（ドラッグ不可）
socket.on('chatLogs', (post) => {
    handleChatLogs(post);
});

// 自分メモ（ドラッグ可能）
socket.on('memoLogs', (memo) => {
    handleMemoLogs(memo);
});

// 自分のメモボタン公開（ドラッグ可能）
socket.on('myOpenCard', (msg) => {
    processMyOpenCard(msg);
})

// 他の人のメモボタン公開（ドラッグ不可）
socket.on('downCard', (msg) => {
    processDownCard(msg);
});

// ドロップ自分の重ねてオープン
socket.on('myKasaneOpen', data => {
    handleMyKasaneOpen(data);
});

// ドロップ他の人の重ねてオープン
socket.on('kasaneOpen', (post, dropId) => {

});

// < 投票を受信
socket.on('updateVote', (voteData) => {
    handleUpdateVote(voteData);
});

// < bookmark を受信
socket.on('bookmark', (data) => {
    const item = $(data.id);
    const countElement = item.querySelector(`.bookmark-container span`);
    countElement.textContent = data.count;
});

// 他の人が D & D をしている
socket.on('dragstart', (draggedId) => {// < ドラッグ開始 >
    $(draggedId).style.border = '3px dotted';
});

socket.on('dragend', (draggedId) => {// < ドラッグ終了 >
    $(draggedId).style.border = '';
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

function handleMyKasaneOpen(data) { // 自分の重ねてオープン
    const post = data.postSet;
    const memoId = post.memoId;
    const dropId = data.dropId;

    const dropElement = $(dropId);
    // console.log('dropElement: ', dropElement);
    // if (dropElement.classList.contains('kasane') || dropElement.parentNode.classList.contains('kasane')) {
    //     let parentDIV = dropElement.closest('.kasane');
    //     parentDIV.appendChild(draggedElement);
    // } 
    const accordionContainer = createHtmlElement('details', 'accordion');
    messageLists.insertBefore(accordionContainer, dropElement);

    const master = changeTagName(dropElement, 'summary');
    accordionContainer.appendChild(master);

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
    accordionContainer.appendChild(children);

    const childCount = accordionContainer.children.length; // 要素ノードの数を取得

    accordionContainer.style.borderLeft = `${(childCount - 1) * 2}px solid #EF7D3C`;

    draggedElement.style.visibility = '';
    master.style.border = "";
    master.style.color = '';
}

function handlePastLogs(pastLogs, stackLogs) {
    pastLogs.forEach((pastElement) => {
        pastElement.childPostIds.length > 0
            ? appendNestedContainer_fromPastLogs(pastElement, stackLogs)
            : addSimpleLog(pastElement);
    });
    markTheBeginingOfParticipate(); // ここから参加
}

function addSimpleLog(pastElement) {
    const item = buildMlElement(pastElement);
    if (pastElement.memoId) {
        item.classList.add('downCard', 'visible');
    }
    addBeingDraggedListeners(item);
    appendChildWithIdAndScroll(item, pastElement, true);
}

function markTheBeginingOfParticipate() {
    const item = createHtmlElement('div', 'ml', '-----⇊ ここから参加 ⇊-----');
    appendChildWithIdAndScroll(item, {}, false);
}

function appendNestedContainer_fromPastLogs(pastElement, stackLogs) {

    const master = createHtmlElement('summary', 'ml');
    master.appendChild(createNameTimeMsg(pastElement));
    createSurveyContainer(pastElement, master);
    master.appendChild(createActionButtons(pastElement));

    if (pastElement.isOpenCard) {
        master.classList.add('downCard', 'visible');
    }
    // enableDragAndDrop(master);
    appendChildWithIdAndScroll(master, pastElement, false);

    const accordionContainer = createHtmlElement('details', 'accordion');
    accordionContainer.appendChild(master);

    let kobuns = makeKobunsArray(stackLogs, pastElement);
    accordionContainer.style.borderLeft = `${kobuns.length * 2}px solid #EF7D3C`;

    let children = createHtmlElement('div', 'children');
    // 重ね子分を表示
    kobuns.forEach(kobun => {
        const child = createHtmlElement('p', 'child');
        child.appendChild(createNameTimeMsg(kobun));
        createSurveyContainer(kobun, child);
        child.appendChild(createActionButtons(kobun));
        child.id = kobun.id;
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
            if (stackElement.id == pastElement.stackedPostIds[i]) {
                kobuns.push(stackElement);
            }
        }
    });
    return kobuns;
}

function handleMyChat(post) { // MyChat
    const item = buildMlElement(post);
    enableDragAndDrop(item);
    appendChildWithIdAndScroll(item, post, true);
}

function handleChatLogs(post) { // ChatLogs
    const item = buildMlElement(post);
    addBeingDraggedListeners(item);
    appendChildWithIdAndScroll(item, post, true);
}

function handleMemoLogs(memo, shouldScroll = true) {
    const item = buildMlBaseStructure(memo, '[memo]');
    item.classList.add('memo');
    const memoSendContainer = buildMemoSendContainer(memo);
    item.appendChild(memoSendContainer);
    console.log('memo: ', memo);

    enableDragAndDrop(item);
    appendChildWithIdAndScroll(item, memo, shouldScroll);
}

function buildMemoSendContainer(memo) {
    const memoSendContainer = createHtmlElement('div', 'memoSend-container');

    const memoSendButton = createHtmlElement('button', 'memoSendButton', '➤');
    memoSendButton.addEventListener('click', e => {
        memoSendButton.classList.add("active");
        e.preventDefault();
        socket.emit('revealMemo', memo);
        memoSendButton.disabled = true;
        memoSendButton.closest('.memo').classList.add('invisibleMemo');
    });

    memoSendContainer.appendChild(memoSendButton);
    return memoSendContainer;
}

function processMyOpenCard(msg) {
    processDownCard(msg, true);
}

function processDownCard(msg, isMine = false) {
    const opencardCreatedAt = msg.createdAt;
    const timeSpanArray = document.querySelectorAll("#messageLists div span.time");

    for (let i = 0; i < timeSpanArray.length; i++) {
        const compareCreatedAt = timeSpanArray[i].textContent;
        const isBefore = checkIsBefore(opencardCreatedAt, compareCreatedAt);

        if (isBefore === false) {
            if (i === timeSpanArray.length - 1) { // 最新
                insertDownCard(msg, timeSpanArray, i, true, isMine);
                return;
            }
            continue;
        }
        else { // ここで messageLists に挿入
            insertDownCard(msg, timeSpanArray, i, false, isMine);
            return;
        }
    }
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
        const surveyNum = item.querySelector(`.survey-container .survey-num-${i}`);
        surveyNum.textContent = voteSum;
    });
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
    const newElement = document.createHtmlElement(newTagName);
    [...oldElement.attributes].forEach(attr => newElement.setAttribute(attr.name, attr.value));
    newElement.innerHTML = oldElement.innerHTML;

    // 元の要素を新しい要素で置き換える
    oldElement.parentNode
        ? oldElement.parentNode.replaceChild(newElement, oldElement)
        : console.log('newElement: ', newElement);
    return newElement;
}

// 既に開いているものを重ねる
function createKasaneDiv(draggedElement, dropElement) {
    const accordionContainer = createHtmlElement('details', 'accordion');
    messageLists.insertBefore(accordionContainer, dropElement);

    const master = changeTagName(dropElement, 'summary');
    accordionContainer.appendChild(master);

    let children = createHtmlElement('div', 'children');
    const child = changeTagName(draggedElement, 'p');
    child.classList.add('child');
    child.style.visibility = '';
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

    const timeData = message.memoCreatedAt ? message.memoCreatedAt : message.createdAt;
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
        const surveyNum = createHtmlElement('span', 'survey-num-' + (i), `${message.voteSums[i]}`);
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
    const targetDate = new Date(target);
    const compareCreatedAtDate = new Date(compareCreatedAt);
    return targetDate < compareCreatedAtDate;
}

// エキサイト機能
// let currentColor = { r: 38, g: 49, b: 101 }; // 初期の色
// function updateHeaderColorBasedOnMemoCount(memoCount) {
//     const header = document.querySelector('header');
//     const endColor = { r: 184, g: 46, b: 46 }; // 最終的に目指す色
//     const maxMemoCount = 30; // memoCount がこの値に達すると完全に赤になる
//     const progress = Math.min(memoCount / maxMemoCount, 1); // 0から1までの範囲で進捗率を計算


//     // memoCount に応じて現在の色を更新
//     const redIntensity = Math.round(currentColor.r + (endColor.r - currentColor.r) * progress);
//     const greenIntensity = Math.round(currentColor.g + (endColor.g - currentColor.g) * progress);
//     const blueIntensity = Math.round(currentColor.b + (endColor.b - currentColor.b) * progress);

//     header.style.backgroundColor = `rgb(${redIntensity}, ${greenIntensity}, ${blueIntensity})`;
// }