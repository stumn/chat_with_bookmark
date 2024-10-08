// utils.js = index.js と dbOperations.js で使う関数のうち、
// socket.io やDBに直接関連しない部分の関数をまとめている

// [共通] エラーをコンソールに出力する関数(consoleが無限に増えないので見やすい)
function handleErrors(error, customMsg = '') {
    console.error(customMsg, error);
    throw error;
}

// --dbOperations.js で使う post を整える 関数--
function organizeLogs(post) {
    const pastUpSum = post.ups.length;
    const pastDownSum = post.downs.length;
    const pastBookmarkSum = post.bookmarks.length;

    const voteSums = calculate_VoteSum(createVoteArrays(post));// 投票合計

    // 返り値
    return {
        _id: post._id,
        name: post.name,
        msg: post.msg,
        question: post.question,
        options: post.options,
        ups: pastUpSum,
        downs: pastDownSum,
        bookmarks: pastBookmarkSum,
        voteSums: voteSums,
        createdAt : post.createdAt
    };
}

function organizeCreatedAt(createdAt) {
    const UTCdate = new Date(createdAt);
    UTCdate.setHours(UTCdate.getHours() + 9);
    const organizedCreatedAt = UTCdate.toISOString().match(/T(\d{2}:\d{2}:\d{2})/)[1];
    createdAt = organizedCreatedAt;
    return createdAt;
}

//　--以下、index.js で使う関数--

// ~~~投票関連 processVoteEvent で使う関数~~~

// -投票配列を作成(二次元配列[[ken_id, takashi_id][naknao_id][okamoto_id]])
function createVoteArrays(surveyPost) {
    let voteArrays = [];
    voteArrays.push(surveyPost.voteOpt0);
    voteArrays.push(surveyPost.voteOpt1);
    voteArrays.push(surveyPost.voteOpt2);
    return voteArrays;
}

// -ユーザーが既にvoteしているか確認
function checkVoteStatus(userSocketId, voteArrays) { // voteArrays は二次元配列
    for (let index = 0; index < voteArrays.length; index++) { // i = 0, 1, 2
        const voteOptArray = voteArrays[index];
        for (const voteOpt of voteOptArray) {
            if (Array.isArray(voteOpt)) { // 選択肢i の投票者配列が、配列の場合
                if (voteOpt.some(obj => obj.id === userSocketId)) {
                    return { userHasVoted: true, hasVotedOption: index }; // 投票済み
                }
            }
            else { // 選択肢i の投票者配列が、配列でない場合
                if (voteOpt === userSocketId) {
                    return { userHasVoted: true, hasVotedOption: index }; // 投票済み
                }
            }
        }
    }
    return { userHasVoted: false, hasVotedOption: undefined }; // 未投票
}

// handle_Voted_User は、index.js に記載
// (socket.io の処理が含まれるため)

// 未投票者の処理は、index.js に記載
// (処理が短いため関数に切り分けていない)

function calculate_VoteSum(voteArrays) {
    let voteSums = [];
    for (let i = 0; i < voteArrays.length; i++) {
        voteSums[i] = voteArrays[i].length;
    }
    return voteSums;
}

// -投票データを整理
function organize_voteData(surveyPost, voteSums) {
    return {
        _id: surveyPost._id,
        count0: voteSums[0],
        count1: voteSums[1],
        count2: voteSums[2]
    };
}

// ~~~イベント関連 processEvent で使う関数~~~

// ユーザーのイベント状況を確認
async function checkEventStatus(events, userSocketId) {
    let isAlert = false;
    if (events.length > 0) {
        const existingUser = events.find(obj => obj.userSocketId === userSocketId);
        if (existingUser) {
            isAlert = true;
        }
    }
    return isAlert;
}

function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }
  
  // ★投票イベントを処理する関数
  async function processVoteEvent(msgId, option, userSocketId, socket) {
    try {
      const surveyPost = await findPost(msgId); // ポストを特定
      let voteArrays = createVoteArrays(surveyPost);  // 投票配列
  
      let { userHasVoted, hasVotedOption } = checkVoteStatus(userSocketId, voteArrays); // ユーザーが投票済みか否か
  
      if (userHasVoted === true) { // 投票済み（関数切り分け済み）
        await handle_Voted_User(option, hasVotedOption, socket, voteArrays, surveyPost);
      }
      else { // 未投票(処理が短いので関数に切り分けていない)
        voteArrays[option].push(userSocketId);
        await surveyPost.save();
      }
  
      let voteSums = calculate_VoteSum(voteArrays); // 投票合計を計算
  
      return organize_voteData(surveyPost, voteSums); //返り値
  
    } catch (error) {
      handleErrors(error, 'processVoteEvent  投票処理中にエラーが発生しました');
    }
  }
  
  // -投票済みユーザーの投票
  async function handle_Voted_User(option, hasVotedOption, socket, voteArrays, surveyPost) {
  
    // 同じ選択肢に投票済み
    if (option === hasVotedOption) {
      socket.emit('alert', '同じ選択肢には投票できません');
      return;
    }
  
    // 違う選択肢に投票済み dialogで確認
    socket.emit('dialog_to_html', '投票を変更しますか？');
    const answer = await new Promise(resolve => { socket.on('dialog_to_js', resolve); });
  
    // answer 変更希望 => 投票済みの選択肢を1減らし、新しい選択肢に1増やす
    if (answer === true) {
      voteArrays[hasVotedOption].pull(socket.id);
      voteArrays[option].push(socket.id);
      await surveyPost.save();
    }
  }
  
  // イベントの受送信（up, down, bookmark）
  async function receiveSendEvent(eventType, msgId, name, socket) {
    console.log('eventType: ' + eventType + ' msgId: ' + msgId + ' name: ' + name);
  
    try {
      const post = await findPost(msgId);
  
      const events = post[eventType + 's']; // ups, downs, bookmarks (配列)
  
      const isAlert = await checkEventStatus(events, socket.id);
  
      if (isAlert) {
        console.log('この人は既にアクションがあります');
        socket.emit('alert', `${eventType}は一度しかできません`);
      } else {
        events.push({ userSocketId: socket.id, name: name });
        console.log(`新たなユーザーの${eventType}を追加しました: ` + JSON.stringify(events));
        await post.save();
      }
  
      const eventData = { _id: post._id, count: events.length };
      io.emit(eventType, eventData); // 結果を送信
  
    } catch (error) {
      handleErrors(error, `receiveSendEvent ${eventType}処理中にエラーが発生しました`);
    }
  }

module.exports = { 
    handleErrors, 
    organizeLogs,
    organizeCreatedAt, 
    createVoteArrays, 
    checkVoteStatus, 
    calculate_VoteSum, 
    organize_voteData, 
    checkEventStatus,
    generateRandomString,
    processVoteEvent,
    handle_Voted_User,
    receiveSendEvent
};