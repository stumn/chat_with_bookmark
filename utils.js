// utils.js = index.js と dbOperations.js で使う関数のうち、
// socket.io やDBに直接関連しない部分の関数をまとめている

// [共通] エラーをコンソールに出力する関数(consoleが無限に増えないので見やすい)
function handleErrors(error, customMsg = '') {
    console.error(customMsg, error);
    throw error;
}

// --dbOperations.js で使う post を整える 関数--
function organizeLogs(post) {
    const data = post.options
        ? {
            id: post._id,
            createdAt: post.createdAt,
            name: post.name,
            msg: post.msg,

            options: post.options,
            voteSums: calculate_VoteSum(post.voters),
            bookmarks: post.bookmarks.length,
            // 重ねる機能
            parentPostId: post.parentPostId,
            childPostIds: post.childPostIds,
            // メモ機能
            memoId: post.memoId,
            memoCreatedAt: post.memoCreatedAt
        }
        : {
            id: post._id,
            createdAt: post.createdAt,
            name: post.name,
            msg: post.msg
        };
    return data;
}

//　--以下、index.js で使う関数--

// ~~~投票関連 processVoteEvent で使う関数~~~

// -ユーザーが既にvoteしているか確認
function checkVoteStatus(userSocketId, voteArrays) { // voteArrays は二次元配列
    console.log('checkVoteStatus:', userSocketId, voteArrays);
    for (let index = 0; index < voteArrays.length; index++) {
        const voteOptArray = voteArrays[index]; // 選択肢i の投票者配列
        console.log('voteOptArray:', index, voteOptArray);
        for (const voteOpt of voteOptArray) {
            if (voteOpt === userSocketId) {
                return { userHasVoted: true, hasVotedOption: index }; // 投票済み
            }
        }
    }
    return { userHasVoted: false, hasVotedOption: undefined }; // 未投票
}

function calculate_VoteSum(voteArrays) {
    let voteSums = [];
    for (let i = 0; i < voteArrays.length; i++) {
        voteSums[i] = voteArrays[i].length;
    }
    return voteSums;
}

// ~~~イベント関連 processEvent で使う関数~~~

// ユーザーのイベント状況を確認
async function checkEventStatus(events, userSocketId) {
    let isAlert = false;
    if (events.length > 0) {
        const existingUser = events.find(obj => obj.userSocketId === userSocketId);
        if (existingUser) { isAlert = true; }
    }
    return isAlert;
}

module.exports = { handleErrors, organizeLogs, checkVoteStatus, calculate_VoteSum, checkEventStatus };