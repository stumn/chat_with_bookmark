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
const switchButton = $('switchButton');

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

// < アンケート投稿をサーバーから受信
socket.on('survey_post', (post) => {
    handleChatLogs(post);
});

// < 自分メモ受信
socket.on('memoLogs', (memo) => {
    handleMemoLogs(memo);
});

// socket.on('memoCount', (memoCount) => {
//     console.log('memoCount: ', memoCount);

//     const header = document.querySelector('header');
//     const redIntensity = Math.min(240 + memoCount * 1, 255);
//     const greenIntensity = Math.max(240 - memoCount * 10, 0);
//     const blueIntensity = Math.max(240 - memoCount * 10, 0);

//     console.log(redIntensity, greenIntensity, blueIntensity);
//     header.style.backgroundColor = `rgb(${redIntensity}, ${greenIntensity}, ${blueIntensity})`;
//     return memoCount;
// });

// // anime
// socket.on('memoCount', (memoCount) => {
//     console.log('memoCount: ', memoCount);

//     const header = document.querySelector('header');

//     const startColor = { r: 38, g: 49, b: 101 };
//     const endColor = { r: 184, g: 46, b: 46 };

//     const steps = 100; // 色が変わるステップ数
//     let step = 0;

//     function animateColorChange() {
//         const progress = step / steps;

//         const redIntensity = Math.round(startColor.r + (endColor.r - startColor.r) * progress);
//         const greenIntensity = Math.round(startColor.g + (endColor.g - startColor.g) * progress);
//         const blueIntensity = Math.round(startColor.b + (endColor.b - startColor.b) * progress);

//         console.log(redIntensity, greenIntensity, blueIntensity);
//         header.style.backgroundColor = `rgb(${redIntensity}, ${greenIntensity}, ${blueIntensity})`;

//         if (step < steps) {
//             step++;
//             requestAnimationFrame(animateColorChange); // 次のフレームで色を更新
//         }
//     }

//     animateColorChange();
// });

let currentColor = { r: 38, g: 49, b: 101 }; // 初期の色

socket.on('memoCount', (memoCount) => {
    console.log('memoCount: ', memoCount);

    const header = document.querySelector('header');

    const endColor = { r: 184, g: 46, b: 46 }; // 最終的に目指す色
    const maxMemoCount = 30; // memoCount がこの値に達すると完全に赤になる
    const progress = Math.min(memoCount / maxMemoCount, 1); // 0から1までの範囲で進捗率を計算
    console.log('progress: ', progress);

    // memoCount に応じて現在の色を更新
    const redIntensity = Math.round(currentColor.r + (endColor.r - currentColor.r) * progress);
    const greenIntensity = Math.round(currentColor.g + (endColor.g - currentColor.g) * progress);
    const blueIntensity = Math.round(currentColor.b + (endColor.b - currentColor.b) * progress);

    console.log(redIntensity, greenIntensity, blueIntensity);
    header.style.backgroundColor = `rgb(${redIntensity}, ${greenIntensity}, ${blueIntensity})`;
});



// 伏せカード登場！
socket.on('downCard', (msg) => {
    handleDownCard(msg);
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

    pastLogs.forEach((pastElement) => {

        // 重ね子分が存在する場合
        if (pastElement.stackedPostIds.length > 0) {
            appendNestedContainer_fromPastLogs(pastElement, stackLogs);
        }
        else { // 重ね子分が存在しない場合
            const item = buildMlElement(pastElement);
            enableDragDrop_appendWithId(item, pastElement);
        }
    });

    // ここから参加
    const item = createElement('div', 'ml', '-----⇊ ここから参加 ⇊-----');
    enableDragDrop_appendWithId(item);

    // 過去ログ全てをドラッグ可能にする
    setPastLogsDraggable();
}

function appendNestedContainer_fromPastLogs(pastElement, stackLogs) {

    // まず、親分を作る
    const item = buildMlElement(pastElement);
    enableDragDrop_appendWithId(item, pastElement);

    // ▼ コンテナを作る
    const nestedMessageContainer = createElement('div', 'kasane', '▼');
    nestedMessageContainer.appendChild(item);

    // 重ね子分を配列に格納
    let kobuns = [];
    stackLogs.forEach(stackElement => {
        for (let i = 0; i < pastElement.stackedPostIds.length; i++) {
            if (stackElement._id == pastElement.stackedPostIds[i]) {
                kobuns.push(stackElement);
            }
        }
    });

    // 重ね子分を表示
    kobuns.forEach(kobun => {
        const item = buildMlElement(kobun);
        enableDragDrop_appendWithId(item, kobun);
        nestedMessageContainer.appendChild(item);
    });

    // コンテナをmessageListsに追加
    messageLists.appendChild(nestedMessageContainer);
}

// handleChatLogs(post);
function handleChatLogs(post) {
    const item = buildMlElement(post);
    item.id = post._id;
    enableDragDrop_appendWithId(item, post);
}

// handleMemoLogs(memo);
function handleMemoLogs(memo, shouldScroll = true) { // buildMlElement(message);に近い
    const item = buildMlBaseStructure(memo, '[memo]');
    const memoSendContainer = buildMemoSendContainer(memo);
    item.appendChild(memoSendContainer);

    // messageLists に追加
    messageLists.appendChild(item);

    if (memo._id) {
        item.id = memo._id;
    }

    if (shouldScroll) {
        window.scrollTo(0, document.body.scrollHeight);
    }
}

function buildMemoSendContainer(memo) {
    const memoSendContainer = createElement('div', 'memoSend-container');

    const button = createElement('button', 'memoSendButton', '➤');
    button.addEventListener('click', e => {
        button.classList.add("active");
        e.preventDefault();
        socket.emit('open_downCard', memo);
        button.disabled = true;
    });

    memoSendContainer.appendChild(button);
    return memoSendContainer;
}

// handleDownCard(msg);
function handleDownCard(msg) {
    const targetCreatedAt = msg.createdAt;
    const timeSpans = document.querySelectorAll("#messageLists div span.time");

    for (let i = 0; i < timeSpans.length; i++) {
        const compare = timeSpans[i].textContent;

        const isBefore = checkIsBefore(targetCreatedAt, compare);

        if (isBefore === false) {
            if (i === timeSpans.length - 1) {
                console.log("target は 最新");
                insertDownCard(msg, timeSpans, i, true);
                // const item = buildMlElement(msg);
                // enableDragDrop_appendWithId(item, msg);
                return;
            }
            continue;
        }
        else { // ここで、messageLists に挿入
            insertDownCard(msg, timeSpans, i);
            return;
        }
    }
}

function insertDownCard(msg, timeSpans, index, isLatest = false) {
    const item = buildMlElement(msg);

    item.classList.add('draggable');
    item.setAttribute('draggable', 'true');
    addDragAndDropListeners(item);

    if (isLatest) {
        messageLists.appendChild(item);
        window.scrollTo(0, document.body.scrollHeight);
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
        console.log('surveyNum: ', surveyNum);
        surveyNum.textContent = voteSum;
    });
}

// handleDrop_Display(stackedData);
function handleDrop_Display(stackedData) {
    console.log('draggedId: ', stackedData.draggedId);
    console.log('dropId: ', stackedData.dropId);

    const draggedElement = $(stackedData.draggedId);
    const stackedMl = $(stackedData.dropId);

    // Create a new div with the class 'kasane'
    const nestedMessageContainer = createElement('div', 'kasane', '▼');

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
            console.log('yes dropElement: ', dropElement);
            if (dropElement.classList.contains('kasane') || dropElement.parentNode.classList.contains('kasane')) {
                let parentDIV = dropElement.closest('.kasane');
                parentDIV.appendChild(draggedElement);
            } else {
                createKasaneDiv(draggedElement, dropElement);
            }
            socket.emit('drop', { draggedId: draggedElement.id, dropId: dropElement.id });
        } else {
            console.log('no dropElement: ', dropElement);
        }
    }
}

function createKasaneDiv(draggedElement, dropElement) {
    console.log('start createKasaneDiv');
    const nestedMessageContainer = createElement('div', 'kasane', '▼');

    console.log('nestedMessageContainer 1: ', nestedMessageContainer);
    messageLists.insertBefore(nestedMessageContainer, dropElement);

    console.log('nestedMessageContainer 2: ', nestedMessageContainer);

    nestedMessageContainer.appendChild(dropElement);
    nestedMessageContainer.appendChild(draggedElement);

    console.log('nestedMessageContainer 3: ', nestedMessageContainer);

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

function buildMlBaseStructure(data, nameText) {
    const item = createElement('div', 'ml');

    const userNameTimeMsg = createNameTimeMsg(data, nameText);
    item.appendChild(userNameTimeMsg);

    return item;
}

function buildMlElement(message) { // chat
    console.log('buildMLElement message: ', message);
    const item = buildMlBaseStructure(message, message.name);

    // (2) case survey => options and votes
    if (message.question) {
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

function enableDragDrop_appendWithId(item, message = {}, shouldScroll = true) {
    // enable drag & drop
    item.classList.add('draggable');
    item.setAttribute('draggable', 'true');
    addDragAndDropListeners(item);

    // messageLists に追加
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
    if (isChecked) {
        console.log('メモモード');
        socket.emit('personal memo', input.value);
    } else {
        // 連続した2つのコロン "::" が2つ以上あるかを判別する
        if ((input.value.match(/::/g) || []).length >= 2) {
            console.log("2つ以上の連続したコロン '::' が含まれています。");
            socket.emit('submitSurvey', input.value);
        } else {
            console.log("連続したコロン '::' が2つ以上含まれていません。");
            socket.emit('chat message', input.value);
        }
    }
    input.value = '';
});

function checkIsBefore(target, compare) {
    const targetDate = new Date(target);
    const compareDate = new Date(compare);
    return targetDate < compareDate;
}
