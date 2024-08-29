// 環境変数の読み込み
require('dotenv').config();

// 必要なモジュールのインポート
const express = require('express');
const app = express();
const routes = require('./routes');

app.use('/', routes);

const http = require('http');
const server = http.createServer(app);

const { Server } = require("socket.io");
const io = new Server(server);

const { mongoose, Post, Memo } = require('./db');
const { getPastLogs, SaveChatMessage, SavePersonalMemo, SaveSurveyMessage, fetchPosts } = require('./dbOperations');

const { error } = require('console');

// 定数の設定
const PORT = process.env.PORT || 3000;
const ANONYMOUS_NAME = '匿名';

// オンラインユーザーのリスト
let onlineUsers = [];
let idsOnlineUsers = [];

// クライアントから接続があったときのイベントハンドラ
io.on('connection', async (socket) => {

  // ログイン時
  socket.on('sign-up', async (name) => {
    name = await logInFunction(name, socket);

    // チャットメッセージ受送信
    socket.on('chat message', async (msg) => {
      const p = await SaveChatMessage(name, msg);
      io.emit('chatLogs', p);
    });

    // 自分メモ受送信
    socket.on('personal memo', async (memo) => {
      const m = await SavePersonalMemo(name, memo, socket);
      socket.emit('memoLogs', m); // 自分だけに送信
    });

    // アンケートメッセージ受送信
    socket.on('submitSurvey', async data => {
      const s = await SaveSurveyMessage(data, name);
      io.emit('survey_post', s);
    });

    // アンケート投票受送信
    socket.on('survey', async (msgId, option) => {
      const voteData = await processVoteEvent(msgId, option, socket.id, socket);
      io.emit('updateVote', voteData);
    });

    // イベント受送信（up, down, bookmark）
    socket.on('event', async (eventType, msgId) => {
      await receiveSendEvent(eventType, msgId, name, socket);
    });
  });

  // 切断時のイベントハンドラ
  socket.on('disconnect', async () => {
    disconnectFunction(socket);
  });
});

// ログイン時（名前・オンラインユーザーリスト・過去ログ）
async function logInFunction(name, socket) {
  name = name !== null && name !== '' ? name : ANONYMOUS_NAME;
  console.log(name + ' (' + socket.id + ') 接続完了💨');

  onlineUsers.push(name);
  idsOnlineUsers.push({ id: socket.id, name: name });
  io.emit('onlineUsers', onlineUsers);

  try {
    // 過去ログを取得
    const pastLogs = await getPastLogs();
    socket.emit('pastLogs', pastLogs);
  } catch (error) {
    handleErrors(error, 'LogInFunction 過去ログ取得中にエラーが発生しました');
  }

  return name;
}

// ★投票イベントを処理する関数
async function processVoteEvent(msgId, option, userSocketId, socket) {
  try {
    const surveyPost = await findSurveyPost(msgId); // ポストを特定
    let voteArrays = createVoteArrays(surveyPost);  // 投票配列

    let { userHasVoted, hasVotedOption } = checkVoteStatus(userSocketId, voteArrays); // ユーザーが投票済みか否か

    if (userHasVoted === true) { // 投票済み
      await handle_Voted_User(option, hasVotedOption, socket, voteArrays, surveyPost);
    } else { // 未投票
      voteArrays[option].push(userSocketId);
      await surveyPost.save();
    }

    let voteSums = calculate_VoteSum(voteArrays, msgId); // 投票合計を計算

    return organize_voteData(surveyPost, voteSums); //返り値

  } catch (error) {
    handleErrors(error, 'processVoteEvent  投票処理中にエラーが発生しました');
  }
}

// -アンケート投稿を特定
async function findSurveyPost(msgId) {
  const surveyPost = await Post.findById(msgId);
  if (!surveyPost) {
    throw new Error(`投稿ID${msgId}が見つかりませんでした。`);
  }
  return surveyPost;
}

// -投票配列を作成(二次元配列[[ken_id, takashi_id][naknao_id][okamoto_id]])
function createVoteArrays(surveyPost) {
  let voteArrays = [];
  voteArrays.push(surveyPost.voteOpt0);
  voteArrays.push(surveyPost.voteOpt1);
  voteArrays.push(surveyPost.voteOpt2);
  return voteArrays;
}

// -ユーザーが既にvoteしているか確認
function checkVoteStatus(userSocketId, voteArrays) {
  for (let index = 0; index < voteArrays.length; index++) {
    const voteOptArray = voteArrays[index];
    for (const voteOpt of voteOptArray) {
      if (Array.isArray(voteOpt)) {
        if (voteOpt.some(obj => obj.id === userSocketId)) {
          return { userHasVoted: true, hasVotedOption: index };
        }
      } else {
        if (voteOpt === userSocketId) {
          return { userHasVoted: true, hasVotedOption: index };
        }
      }
    }
  }
  return { userHasVoted: false, hasVotedOption: undefined };
}

// -投票済みユーザーの投票
async function handle_Voted_User(option, hasVotedOption, socket, voteArrays, surveyPost) {

  // 同じ選択肢に投票済み
  if (option === hasVotedOption) {
    socket.emit('alert', '同じ選択肢には投票できません');
  }
  // 違う選択肢に投票済み
  socket.emit('dialog_to_html', '投票を変更しますか？');
  const answer = await new Promise(resolve => {
    socket.on('dialog_to_js', resolve);
  });
  // 変更希望 => 投票済みの選択肢を1減らし、新しい選択肢に1増やす
  if (answer === true) {
    voteArrays[hasVotedOption].pull(socket.id);
    voteArrays[option].push(socket.id);
    await surveyPost.save();
  }
}

// -投票処理後の投票数計算
function calculate_VoteSum(voteArrays, msgId = '') {
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

// イベントの受送信（up, down, bookmark）
async function receiveSendEvent(eventType, msgId, name, socket) {
  console.log('eventType: ' + eventType + ' msgId: ' + msgId + ' name: ' + name);

  // 処理
  const eventData = await processEventData(msgId, eventType, name, socket);

  // 結果を送信
  io.emit(eventType, eventData);
}

// イベント処理関数(up, down, bookmark)
async function processEventData(msgId, eventType, name, socket) {
  try {
    const post = await findPost(msgId);
    const users = post[eventType + 's']; // ups, downs, bookmarks (配列)
    await addUserAction(users, name, socket.id, post, eventType, socket);

    return {
      _id: post._id,
      count: users.length
    };

  } catch (error) {
    handleErrors(error, `receiveSendEvent ${eventType}イベントデータの処理中にエラーが発生しました`);
  }
}

// 投稿を見つける関数
async function findPost(msgId) {
  const post = await Post.findById(msgId);
  if (!post) {
    handleErrors(error, `投稿見つからない${msgId}`);
    return;
  }
  return post;
}

// ユーザーのアクションを追加する関数
async function addUserAction(users, name, userSocketId, post, eventType, socket) {
  try {
    // 初めてのアクションの場合
    if (users.length === 0) {
      users.push({ userSocketId: userSocketId, name: name });
      console.log(`はじめての${eventType}を追加しました: ` + users[0]);
      await post.save();
      return;
    }

    // 既にアクションがある場合 users.lenght > 0
    const existingUser = users.find(obj => obj.userSocketId === userSocketId);
    if (existingUser) {
      console.log('この人は既にアクションがあります');
      socket.emit('alert', `${eventType}は一度しかできません`);
      return;
    }
    else {// ユーザーが見つからない場合は新規追加
      users.push({ userSocketId: userSocketId, name: name });
      console.log(`新たなユーザーの${eventType}を追加しました: ` + JSON.stringify(users));
      await post.save();
      return;
    }
  } catch (error) {
    handleErrors(error, 'addUserAction関数内');
  }
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

// エラーをコンソールに出力する関数(consoleが無限に増えないので見やすいかも)
function handleErrors(error, customMsg = '') {
  console.error(customMsg, error);
}

// サーバーの起動
server.listen(PORT, () => {
  console.log('listening on *:' + PORT);
});
