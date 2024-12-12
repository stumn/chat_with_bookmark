// 環境変数の読み込み
require('dotenv').config();

// 必要なモジュールのインポート
const express = require('express');
const app = express();
const routes = require('./routes');

// 静的ファイルを提供（JS, CSSなど）
app.use(express.static('public'));

app.use('/', routes);

const http = require('http');
const server = http.createServer(app);

const { Server } = require("socket.io");
const io = new Server(server);

// const { mongoose, Post, Memo } = require('./db');
const { saveUser, getUserInfo, getPastLogs, organizeCreatedAt, SaveChatMessage, SavePersonalMemo, SaveSurveyMessage, SaveRevealMemo, SaveKasaneteMemo, findPost, findMemo, fetchPosts, saveStackRelation, SaveParentPost } = require('./dbOperations');
const { handleErrors, checkVoteStatus, calculate_VoteSum, checkEventStatus } = require('./utils');

const { error } = require('console');

// 定数の設定
const PORT = process.env.PORT || 3000;
// const ANONYMOUS_NAME = '匿名';

// オンラインユーザーのリスト
let onlineUsers = [];
let idsOnlineUsers = [];
let memoCount = 0;

// クライアントから接続があったときのイベントハンドラ
io.on('connection', async (socket) => {

  // ログイン時
  socket.on('sign-up', async (loginData) => {
    console.log(loginData);
    const { name, randomString } = await logInFunction(loginData, socket);

    // 自分メモが記録された場合、自分だけに送信
    socket.on('personal memo', async (memo) => {
      const m = await SavePersonalMemo(name, memo);

      const organizedMemo = {
        id: m._id,
        name: m.name,
        msg: m.msg,
        createdAt: m.createdAt
      }
      socket.emit('memoLogs', organizedMemo); // 自分だけに送信

      memoCount++;
      if (memoCount >= 1) { io.emit('memoCount', memoCount); }
    });

    function decreaseMemoCount() {
      if (memoCount > 0) {
        memoCount -= 1;
        socket.emit('memoCount', memoCount);
      }
    }

    setInterval(decreaseMemoCount, 1000 * 5);

    // チャット（選択肢付き）メッセージが送信されたとき
    socket.on('chat message', async (msg) => {
      let postSet;
      if ((msg.match(/::/g) || []).length >= 2) { // 最初に出現する "::" で分割. 質問と選択肢に分ける
        const { formattedQuestion, options } = parseQuestionOptions(msg);
        const record = await SaveSurveyMessage(name, formattedQuestion, options);
        postSet = {
          id: record.id,
          name: record.name,
          msg: record.msg,
          options: record.options,
          voteSums: record.voteSums,
          createdAt: organizeCreatedAt(record.createdAt)
        }
      } else {
        const p = await SaveChatMessage(name, msg);
        postSet = {
          id: p.id,
          name: p.name,
          msg: p.msg,
          createdAt: organizeCreatedAt(p.createdAt)
        }
      }
      socket.emit('myChat', postSet);
      socket.broadcast.emit('chatLogs', postSet);
    });

    // 投票があったとき
    socket.on('survey', async (msgId, option) => {
      const surveyPost = await findPost(msgId); // ポストを特定
      const voteData = await processVoteEvent(surveyPost, option, socket.id, socket);
      io.emit('updateVote', voteData); // id とcount を送信
    });

    // ブックマークされたとき
    socket.on('bookmark', async (data) => {
      const msgId = data.id;
      data.active === true
        ? await handleBookmark(msgId, name, socket)
        : await handleUnbookmark(msgId, name, socket);
    });

    async function handleBookmark(msgId, name, socket) {
      try {
        const post = await findPost(msgId);
        const bookmarks = post.bookmarks;
        const isAlert = await checkEventStatus(bookmarks, socket.id);

        if (isAlert) {
          // socket.emit('alert', `${eventType}は一度しかできません`);
          return;
        }

        bookmarks.push({ userSocketId: socket.id, name: name });
        await post.save();

        const eventData = { id: post._id, count: bookmarks.length };
        io.emit('bookmark', eventData); // 結果を送信

      } catch (error) {
        handleErrors(error, `handleBookmark処理中にエラーが発生しました`);
      }
    }

    async function handleUnbookmark(msgId, name, socket) {
      try {
        const post = await findPost(msgId);
        const bookmarks = post.bookmarks;

        const target = bookmarks.find(obj => obj.userSocketId === socket.id);
        if (target) {
          const index = bookmarks.indexOf(target);
          bookmarks.splice(index, 1);
          await post.save();

          const eventData = { id: post._id, count: bookmarks.length };
          io.emit('bookmark', eventData); // 結果を送信
        }
      } catch (error) {
        handleErrors(error, `handleUnbookmark処理中にエラーが発生しました`);
      }
    }

    // メモ送信ボタンが押されたとき
    socket.on('revealMemo', async (memo) => {
      const record = await SaveRevealMemo(memo.name, memo.msg, memo.id, memo.createdAt);
      console.log('メモ送信ボタンが押されたとき', record);
      notifyRevealMemo(record, name);

      await updateMemoStatusToOpened(memo.id);

      const postSet = {
        id: record.id,
        name: record.name,
        msg: record.msg,
        memoCreatedAt: organizeCreatedAt(record.memoCreatedAt),
        createdAt: organizeCreatedAt(record.createdAt)
      }

      socket.emit('myOpenCard', postSet);
      socket.broadcast.emit('downCard', postSet);
    });

    socket.on('undisclosedMemoDrop', async (memoId, dropId) => { // 重ねてオープン
      console.log('undisclosedMemoDrop memoID: ', memoId, 'dropId: ', dropId);
      const memo = await findMemo(memoId);
      const target = await findPost(dropId);

      // const inquryData = { options, voters };
      const stackData = { parentPostId: target._id, childPostIds: [] };
      console.log('undisclosedMemoDrop stackData:', stackData);
      const memoData = { memoId: memo._id, memoCreatedAt: memo.createdAt };
      console.log('undisclosedMemoDrop memoData:', memoData);

      const record = await SaveKasaneteMemo(memo.name, memo.msg, stackData, memoData);
      notifyRevealMemo(record, name);
      updateMemoStatusToOpened(memoId);

      // 重ねられた投稿に、stack 情報を追加
      SaveParentPost(record, target);

      const postSet = {
        id: record._id,
        name: record.name,
        msg: record.msg,
        memoCreatedAt: organizeCreatedAt(record.memoCreatedAt),
        memoId: record.memoId,
      }
      const data = { postSet, dropId };

      io.emit('kasaneMemoOpen', data);
    });

    // ドラッグstart
    socket.on('dragstart', id => {
      socket.broadcast.emit('dragstart', id); // 操作したユーザ以外に送信
    });

    // ドラッグend
    socket.on('dragend', id => {
      socket.broadcast.emit('dragend', id); // 操作したユーザ以外に送信
    });

    // ドラッグover
    // ドラッグリーブ

    // ドラッグドロップ
    socket.on('drop', async (kasaneData) => {
      console.log('catch drop:', kasaneData);
      socket.broadcast.emit('broadcastDrop', kasaneData); // 操作したユーザ以外に送信
      const data = await saveStackRelation(kasaneData.draggedId, kasaneData.dropId);
      if(data === 'alert'){
        socket.emit('alert', 'メモを重ねることはできません');
      }
    });
  });

  // < 切断時 >
  socket.on('disconnect', async () => {
    disconnectFunction(socket);
  });
});

async function updateMemoStatusToOpened(memoId) {
  const DBMemo = await findMemo(memoId);
  DBMemo.isBeingOpened = true;
  await DBMemo.save();
}

function notifyRevealMemo(record, name) {
  console.log('メモ公開通知:', record.memoCreatedAt, record.createdAt);
  
  const createdAt = new Date(record.createdAt).getTime();
  const memoCreatedAt = new Date(record.memoCreatedAt).getTime();
  const difference = createdAt - memoCreatedAt;
  console.log('差分:', difference);

  const nowTime = Date.now();
  const id = record.id;
  console.log('id:', id);

  const data = { name, difference, nowTime, id};
  console.log(data);
  
  io.emit('notification', data);
}

function parseQuestionOptions(data) {
  const [question, ...rest] = data.split('::');
  // 残りの部分をまとめて再び "::" で分割して、選択肢の配列を作成
  const options = rest.join('::').split('::').map(option => option.trim());
  const formattedQuestion = question.trim();
  return { formattedQuestion, options };
}

// ログイン時（名前・オンラインユーザーリスト・過去ログ）
async function logInFunction(loginData, socket) {
  const { loginName, randomString } = loginData;
  console.log('loginName:', loginName, 'randomString:', randomString);

  const name = loginName !== null && loginName !== '' ? loginName : '匿名';
  console.log(name + ' (' + socket.id + ') 接続完了💨' + randomString);

  onlineUsers.push(name);
  idsOnlineUsers.push({ id: socket.id, name: name });
  io.emit('onlineUsers', onlineUsers);

  try { // ユーザー情報を保存 
    let user;
    name
      ? user = await saveUser(name, socket.id, randomString)
      : user = 'NONAME';
    console.log('ユーザー情報保存完了📝:', user);
  } catch (error) {
    handleErrors(error, 'LogInFunction ユーザー情報保存中にエラーが発生しました');
  }

  try { // 過去ログを取得・送信
    const { pastLogs, stackLogs } = await getPastLogs(name);
    socket.emit('pastLogs', { pastLogs, stackLogs });
  } catch (error) {
    handleErrors(error, 'LogInFunction 過去ログ取得中にエラーが発生しました');
  }
  return { name, randomString };
}

// ★投票イベントを処理する関数
async function processVoteEvent(surveyPost, option, userSocketId, socket) {
  try {
    const voteArrays = surveyPost.voters;  // 投票配列
    let { userHasVoted, hasVotedOption } = checkVoteStatus(userSocketId, voteArrays); // ユーザーが投票済みか否か

    userHasVoted === true
      ? await VotedUser(option, hasVotedOption, socket, voteArrays, surveyPost)
      : await saveVote(voteArrays, option, userSocketId, surveyPost);

    return {
      id: surveyPost._id,
      voteSums: calculate_VoteSum(voteArrays)
    };

  } catch (error) {
    handleErrors(error, 'processVoteEvent  投票処理中にエラーが発生しました');
  }
}

// -投票済みユーザーの投票
async function VotedUser(option, hasVotedOption, socket, voteArrays, surveyPost) {

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
    saveVote(voteArrays, option, socket.id, surveyPost);
  }
}

async function saveVote(voteArrays, option, userSocketId, surveyPost) {
  voteArrays[option].push(userSocketId);
  surveyPost.markModified('voters');
  await surveyPost.save();
}

// 切断時のイベントハンドラ　＝　オンラインメンバーから削除
async function disconnectFunction(socket) {
  try {
    const targetName = idsOnlineUsers.find(obj => obj.id === socket.id)?.name;
    onlineUsers = onlineUsers.filter(val => val !== targetName);
    io.emit('onlineUsers', onlineUsers);
  } catch (error) {
    handleErrors(error, 'disconnectFunction 切断時');
  }
}

// サーバーの起動
server.listen(PORT, () => {
  console.log('listening on *:' + PORT);
});
