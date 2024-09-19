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

module.exports = { handleErrors, organizeLogs, createVoteArrays, checkVoteStatus, calculate_VoteSum, organize_voteData, checkEventStatus };