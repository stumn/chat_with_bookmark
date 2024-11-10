// utils.js = index.js と dbOperations.js で使う関数のうち、
// socket.io やDBに直接関連しない部分の関数をまとめている

// [共通] エラーをコンソールに出力する関数(consoleが無限に増えないので見やすい)
function handleErrors(error, customMsg = '') {
    console.error(customMsg, error);
    throw error;
}

// --dbOperations.js で使う post を整える 関数--
function organizeLogs(post) {
    const pastBookmarkSum = post.bookmarks.length;
    const voteSums = calculate_VoteSum(post.voters);// 投票合計

    // 返り値
    return {
        _id: post._id,
        name: post.name,
        msg: post.msg,
        bookmarks: pastBookmarkSum,
        createdAt: post.createdAt,
        options: post.options,
        voteSums: voteSums,
        isStackingOn: post.parentPostId ? true : false,
        stackedPostIds: post.childPostIds,
        memoId: post.memoId,
        memoCreatedAt: post.memoCreatedAt
    };
}


//　--以下、index.js で使う関数--

// ~~~投票関連 processVoteEvent で使う関数~~~

// -ユーザーが既にvoteしているか確認
function checkVoteStatus(userSocketId, voteArrays) { // voteArrays は二次元配列
    for (let index = 0; index < voteArrays.length; index++) { // i = 0, 1, 2
        const voteOptArray = voteArrays[index];
        console.log('voteOptArray: ', voteOptArray);

        for (const voteOpt of voteOptArray) {
            console.log('voteOpt: ', voteOpt);

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

module.exports = { handleErrors, organizeLogs, checkVoteStatus, calculate_VoteSum, checkEventStatus };