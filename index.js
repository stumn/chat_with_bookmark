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
const {
  saveUser,
  getPastLogs,
  SaveChatMessage,
  SavePersonalMemo,
  SaveSurveyMessage
} = require('./dbOperations');

const {
  handleErrors,
  organizeCreatedAt,
  generateRandomString,
  processVoteEvent,
  receiveSendButtonEvent
} = require('./utils');

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
  socket.on('sign-up', async (rawname) => {
    const { name, randomString } = await logInFunction(rawname, socket);
    socket.emit('randomString', randomString);

    // < チャットメッセージ >
    socket.on('chat message', async (msg) => {
      const p = await SaveChatMessage(name, msg);

      const organizedPost = {
        _id: p._id,
        name: p.name,
        msg: p.msg,
        question: p.question,
        options: p.options,
        createdAt: organizeCreatedAt(p.createdAt)
      }

      io.emit('chatLogs', organizedPost);
    });

    // < 自分メモ >
    socket.on('personal memo', async (memo) => {
      const m = await SavePersonalMemo(name, memo, socket);

      const organizedMemo = {
        _id: m._id,
        name: m.name,
        msg: m.msg,
        createdAt: organizeCreatedAt(m.createdAt)
      }
      console.log('organizedMemo', organizedMemo);
      socket.emit('memoLogs', organizedMemo); // 自分だけに送信
    });

    // < アンケートメッセージ >
    socket.on('submitSurvey', async data => {
      const s = await SaveSurveyMessage(data, name);
      io.emit('survey_post', s);
    });

    // < アンケート投票 >
    socket.on('survey', async (msgId, option) => {
      const voteData = await processVoteEvent(msgId, option, socket.id, socket);
      io.emit('updateVote', voteData);
    });

    // < ボタンイベント (up, down, bookmark) >
    socket.on('event', async (eventType, msgId) => {
      await receiveSendButtonEvent(eventType, msgId, name, socket);
    });

    // 伏せカードオープン
    socket.on('open_downCard', async (msg) => {
      console.log('open_downCard', msg);
      const p = await SaveChatMessage(name, msg.msg);

      const organizedPost = {
        _id: p._id,
        name: p.name,
        msg: p.msg,
        question: p.question,
        options: p.options,
        createdAt: msg.createdAt
      }

      io.emit('downCard', organizedPost);
    });
  });

  // < 切断時 >
  socket.on('disconnect', async () => {
    disconnectFunction(socket);
  });
});

// ログイン時（名前・オンラインユーザーリスト・過去ログ）
async function logInFunction(rawname, socket) {
  const name = rawname !== null && rawname !== '' ? rawname : ANONYMOUS_NAME;
  console.log(name + ' (' + socket.id + ') 接続完了💨');

  onlineUsers.push(name);
  idsOnlineUsers.push({ id: socket.id, name: name });
  io.emit('onlineUsers', onlineUsers);

  // ランダム文字列生成
  const randomString = generateRandomString(10); // 10文字
  console.log('randomString: ', randomString);

  try { // ユーザー情報を保存 
    await saveUser(name, socket.id, randomString);
    console.log('ユーザー情報保存たぶん完了');
  } catch (error) {
    handleErrors(error, 'LogInFunction ユーザー情報保存中にエラーが発生しました');
  }

  try { // 過去ログを取得・送信
    const pastLogs = await getPastLogs();
    console.log('過去ログ取得完了', pastLogs);
    socket.emit('pastLogs', pastLogs);
  } catch (error) {
    handleErrors(error, 'LogInFunction 過去ログ取得中にエラーが発生しました');
  }
  return { name, randomString };
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
