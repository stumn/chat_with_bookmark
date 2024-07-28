// 環境変数の読み込み
require('dotenv').config();

// 必要なモジュールのインポート
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { Post } = require('./db');
const { error } = require('console');

// 定数の設定
const PORT = process.env.PORT || 3000;
const ANONYMOUS_NAME = '匿名';
const MAX = 1;

function setupServer(){
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  return {app, server, io};
}

const {app, server, io} = setupServer();

// ルートへのGETリクエストに対するハンドラ
app.get('/', (_, res) => {
  res.sendFile(__dirname + '/index.html');
});

// スタイルシートへのGETリクエストに対するハンドラ
app.get('/style.css', function (_, res) {
  res.header('Content-Type', 'text/css');
  res.sendFile(__dirname + '/style.css');
});

// オンラインユーザーのリスト
let onlineUsers = [];
let idsOnlineUsers = [];

// クライアントから接続があったときのイベントハンドラ
io.on('connection', async (socket) => {

  // ログイン時
  socket.on('login', async (name) => {
    name = await logInFunction(name, socket);

    // タイピングイベント受送信
    socket.on('typing', () => {
      io.emit('typing', name);
    });

    // チャットメッセージ受送信
    socket.on('chat message', async (nickname, msg) => {
      name = await receiveSend_Chat(name, nickname, msg);
    });

    // アンケートメッセージ受送信
    socket.on('submitSurvey', async data => {
      await receiveSend_Survey(data, name);
    });

    // アンケート投票受送信
    socket.on('survey', async (msgId, option) => {
      await receiveSend_Vote(msgId, option, name, socket);
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

// ログイン時（名前・オンラインユーザーリスト・過去ログ・いらっしゃい）
async function logInFunction(name, socket) {
  name = name !== null && name !== '' ? name : ANONYMOUS_NAME;
  console.log(name + ' (' + socket.id + ') 接続完了💨');

  onlineUsers.push(name);
  idsOnlineUsers.push({ id: socket.id, name: name });
  io.emit('onlineUsers', onlineUsers);

  // 過去ログを取得
  const pastLogs = await getPastLogs();
  socket.emit('pastLogs', pastLogs);

  // // いらっしゃいメッセージ
  // const welcomeMsg = name + 'さん、いらっしゃい！';
  // templateMsg('welcome', welcomeMsg);
  return name;
}

// ログイン時・過去ログをDBから取得
async function getPastLogs() {
  try {
    const posts = await Post.find({}).limit(30).sort({ createdAt: -1 });
    posts.reverse();
    const pastLogs = await Promise.all(posts.map(organizeLogs));
    console.log('過去ログ整理完了');
    return pastLogs;
  } catch (error) {
    handleErrors(error, '過去ログ');
    throw error;
  }
}

// データベースにレコードを保存
async function saveRecord(name, msg, question = '', options = [], ups = [], downs = [], voteOpt0 = [], voteOpt1 = [], voteOpt2 = []) {
  try {
    const npData = { name, msg, question, options, ups, downs, voteOpt0, voteOpt1, voteOpt2 };
    const newPost = await Post.create(npData);
    return newPost;
  } catch (error) {
    handleErrors(error, 'データ保存時');
    throw error;
  }
}

// チャットメッセージ受送信
async function receiveSend_Chat(name, nickname, msg) {
  name = /^\s*$/.test(nickname) ? name : nickname;

  try {
    const p = await saveRecord(name, msg);
    console.log('チャット保存しました💬:' + p.msg + p.id);
    io.emit('chatLogs', p);
  }
  catch (error) {
    handleErrors(error, 'チャット受送信');
  }
  return name;
}

// アンケートメッセージ受送信
async function receiveSend_Survey(data, name) {
  const Q = data.question;
  const optionTexts = [data.options[0], data.options[1], data.options[2]];
  try {
    const surveyPost = await saveRecord(name, '', Q, optionTexts);
    const xxx = organizeLogs(surveyPost);
    console.log('アンケート保存しました📄:' + xxx.question + xxx._id);
    io.emit('survey_post', xxx);
  } catch (error) {
    handleErrors(error, 'アンケート受送信');
  }
}

function organizeLogs(post) {
  const pastUpSum = calculateSum(post.ups, 'up');
  const pastDownSum = calculateSum(post.ups, 'up');
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
    voteSums: voteSums
  };
}

// ★★アンケート投票受送信
async function receiveSend_Vote(msgId, option, name, socket) {
  console.log('投票先のポスト: ' + msgId + ' 選んだ選択肢: ' + option + ' 🙋 by ' + name);
  try {
    const voteData = await processVoteEvent(msgId, option, socket.id, socket);
    io.emit('updateVote', voteData);
  } catch (error) {
    handleErrors(error, 'アンケート投票受送信');
  }
}

// ★投票イベントを処理する関数
async function processVoteEvent(msgId, option, userSocketId, socket) {
  try {
    // ポストを特定
    const surveyPost = await findSurveyPost(msgId);

    // 投票配列
    let voteArrays = createVoteArrays(surveyPost);

    // ユーザーが投票済みか否か
    let { userHasVoted, hasVotedOption } = checkVoteStatus(userSocketId, voteArrays);

    // 投票済み
    if (userHasVoted === true) {
      console.log(`ID ${userSocketId} は、投票者配列${hasVotedOption}にいます🙋`);
      await handle_Voted_User(option, hasVotedOption, socket, voteArrays, surveyPost);
    }

    // まだ投票したこと無い
    else if (userHasVoted === false) {
      handle_NeverVoted_User(option, surveyPost, voteArrays, userSocketId);
    }

    // 投票合計を計算
    let voteSums = calculate_VoteSum(voteArrays, msgId);

    // 返り値
    return {
      _id: surveyPost._id,
      count0: voteSums[0],
      count1: voteSums[1],
      count2: voteSums[2]
    };

  } catch (error) {
    handleErrors(error, 'vote関数内');
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
  let hasVotedOption;
  let userHasVoted = false;
  voteArrays.forEach((voteOptArray, index) => {
    voteOptArray.forEach((voteOpt) => {
      if (Array.isArray(voteOpt)) {
        if (voteOpt.some(obj => obj.id === userSocketId)) {
          console.log('配列で一致');
          hasVotedOption = index;
          userHasVoted = true;
        } else {
          console.log('配列だけど、一致しないね');
        }
      }
      else {
        if (voteOpt === userSocketId) {
          console.log('配列じゃないけど、一致');
          hasVotedOption = index;
          userHasVoted = true;
        } else {
          console.log('checkVoteStatus配列じゃないし、一致もしない');
        }
      }
    });
  });
  return { userHasVoted, hasVotedOption };
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

// -未投票ユーザーの投票
async function handle_NeverVoted_User(option, surveyPost, voteArrays, userSocketId) {
  console.log(`ID ${userSocketId} は、まだ1度も投票していません🙅`);

  // あり得ないと思うけど、エラー処理（選択肢がマイナスや、3以上などの存在しない数）
  if (option < 0 || option >= voteArrays.length) {
    handleErrors(error, '無効なオプション');
  }

  voteArrays[option].push(userSocketId);
  console.log(`ID ${userSocketId} は、投票者配列${option}に追加されました🙋`);
  await surveyPost.save();
  console.log('falseFuction投票保存完了🙆: ' + surveyPost);
}

// -投票処理後の投票数計算
function calculate_VoteSum(voteArrays, msgId = '') {
  let voteSums = [];
  for (let i = 0; i < voteArrays.length; i++) {
    voteSums[i] = voteArrays[i].length;
  }
  return voteSums;
}


// ここから👆👇
async function receiveSendEvent(eventType, msgId, name, socket) {
  let eventEmoji;
  let Array;
  
  try {
    
    // 1投稿を見つける
    const post = await findPost(msgId, eventType);

    // 2 eventTypeで場合分け
    switch(eventType){
      case 'up':
        eventEmoji = '👆';
        Array = post.ups;
        break;
      case 'down':
        eventEmoji = '👇';
        Array = post.downs;
        break;
      case 'bookmark':
        eventEmoji = '🔖';
        Array = post.bookmarks;
        break;
    }

    console.log(eventType + '先のポスト: ' + msgId + eventEmoji + 'by' + name);
    console.log(Array);

    // 3ユーザーの状態で条件分岐したうえで、up OR down OR bookmark を追加する
    await addUserAction(Array, socket.id, post, socket, eventType);

    // 4 up OR down OR bookmark 追加後のデータをオブジェクトにまとめる
    const eventData = await processEventData(Array, eventType, post);
    console.log(eventData);

    // 結果を送信
    io.emit(eventType, eventData);
  } catch (error) {
    handleErrors(error, 'receiveSendEvent受送信' + eventType);
  }
}

async function findPost(msgId, eventType) {
  const post = await Post.findById(msgId);
  if (!post) {
    handleErrors(error, `${eventType}投稿見つからない${msgId}`);
    return;
  }
  console.log(post);
  return post;
}

async function addUserAction(users, userSocketId, post, socket, eventType) {
  const actionUsers = post[eventType + 's']; // 'ups'または'downs'

  // アクションがまだない場合
  if (actionUsers.length === 0) {
    users.push({ userSocketId: userSocketId, [eventType]: 1 });
    console.log(`はじめての${eventType}を追加しました: ` + users);
    await post.save();
    return;
  }

  // 既にアクションがある場合
  const existingUser = users.find(item => item.userSocketId === userSocketId);

  // ユーザーが見つからない場合はエラー処理
  if (existingUser == null) {
    handleErrors(new Error(`error in addUserAction: ${eventType}`), `error in addUserAction: ${eventType}`);
    return;
  }

  // アクションの上限に達している場合
  if (existingUser[eventType] >= MAX) {
    socket.emit('alert', `${MAX}回以上${eventType}は出来ません`);
    return;
  }

  // アクションを追加
  existingUser[eventType] += 1;
  await post.save();
}

async function processEventData(Array, eventType, post) {
  try {
    // 合計を計算
    const sum = await calculateSum(Array, eventType);

    // 返り値
    return {
      _id: post._id,
      count: sum
    };
  } catch (error) {
    handleErrors(error, 'processEventData関数内');
  }
}

function calculateSum(array, actionType) {
  console.log(array);
  return array.reduce((sum, item) => sum + item[actionType], 0);
}
// ここまで👆👇

// テンプレメッセージを送信・DB保存
async function templateMsg(templateEvent, message) {
  io.emit(templateEvent, message);
  await saveRecord('system', message);
}

// 切断時のイベントハンドラ
function disconnectFunction(socket) {
  let targetId = socket.id;
  let targetName = idsOnlineUsers.find(obj => obj.id === targetId)?.name;

  // さようならテンプレ
  const byeMsg = targetName + 'さん、またね！';
  templateMsg('bye', byeMsg);

  // オンラインメンバーから削除
  let onlinesWithoutTarget = onlineUsers.filter(val => val !== targetName);
  onlineUsers = onlinesWithoutTarget;
  io.emit('onlineUsers', onlineUsers);
}

// エラーをコンソールに出力する関数
function handleErrors(error, custonMsg = '') {
  console.error(custonMsg, error);
}

// サーバーの起動
server.listen(PORT, () => {
  console.log('listening on *:' + PORT);
});

