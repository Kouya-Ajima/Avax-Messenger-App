/** @format */

import { BigNumberish, ethers, Contract } from 'ethers';
import abi from '@/utils/Messenger.json';
import { getEtherum } from '@/utils/ethereum';
import { Messenger as MessengerType } from '@/typechain-types';
import { useEffect, useState } from 'react';

/** 独自の Hooks で Type を定義 */
export type Message = {
    sender: string;
    receiver: string;
    depositInWei: BigNumberish;
    timestamp: Date;
    text: string;
    isPending: boolean;
};

// メッセージの型
type SendMessageProps = {
    text: string;
    receiver: string;
    tokenInEther: string;
};

// UseState で返すデータの型を定義
type ReturnUseMessengerContract = {
    processing: boolean;
    ownMessages: Message[];
    // 親で呼出して、子で処理する。
    sendMessage: (props: SendMessageProps) => void;
};

type UseMessengerContractPsops = {
    // アカウントは取得できるときと、できない時がある。
    currentAccount: string | undefined;
};

// コントラクトアドレスを使用してコントラクトに接続する。
const contractAddress = '0x1A39EAAfd55D97b7e499ab5f7f8055a40DcF4183';

// コントラクトの情報 → Abi を取得する。 → Jsonになっているのでその形式で取得
const contractAbi = abi.abi;

/**
 * ReturnUseMessengerContract → UseState で返す関数。
 * 親で呼出して、子で処理する。  → currentAccount を更新する。
 */
export const useMessengerContract = ({
    currentAccount,
}: UseMessengerContractPsops): ReturnUseMessengerContract => {
    /**
     *  状態変数を定義
     */

    // トランザクションの処理中のフラグを表す状態変数。
    const [processing, setProcessing] = useState<boolean>(false);

    // ユーザ宛のメッセージを配列で保持する状態変数。
    const [ownMessages, setOwnMessages] = useState<Message[]>([]);

    // Messenger コントラクトを 格納する状態変数 → 初期値なし
    const [messengerContract, setMessengerContract] = useState<Contract>();

    /**
     *  ethereum プロバイダー(オブジェクト)を取得
     */
    const ethereum = getEtherum();

    /**
     *  コントラクトを取得する → ブロックチェーンから読み取るのでAsync
     */
    async function getMessengerContract() {
        try {
            // MetaMaskInpageProvider の window.Ethereum があれば実行
            if (ethereum) {
                //  ethers.BrowserProvider → Metamask を介して、ブロックのノードに接続する。
                const provider = new ethers.BrowserProvider(ethereum);

                // signerは,ユーザーのウォレットアドレスを抽象化したもの
                //  → 書き込みのアクセスを要求するときに使う → ブロックチェーンから読み取るのでAsync
                //  → provider.getSigner() をしてコントラクトに接続するだけで、
                //    Wallet アドレスを通じてトランザクションを呼出し、署名やテストネットへの送信が可能
                // ⭐署名つきでトランザクションを送信する。
                const signer = await provider.getSigner();

                // コントラクトに接続 → コントラクトアドレス、Abi、provider,もしくはsigner を渡す。
                //  Signer の場合、コントラクトへの読み書きが許可される。  Provider は読み取り。
                const MessengerContract = new ethers.Contract(
                    contractAddress,
                    contractAbi,
                    signer
                );

                // コントラクトをセット
                setMessengerContract(MessengerContract);

                // MetaMaskInpageProvider の window.Ethereum が無い時は失敗
            } else {
                console.log("Ethereum object doesn't exist!");
            }

            // エラー処理
        } catch (error) {
            console.log(error);
        }
    }

    /**
     *   自分宛てのメッセージを取得する。  → ブロックチェーンから読み取るのでAsync
     * @returns 自分宛てのメッセージ
     */
    async function getOwnMessages() {
        // messengerContract が存在すれば リターン
        //  ❓ ここの記述はわからない。
        if (!messengerContract) return;

        // 例外処理
        try {
            // getOwnMessages() をコントラクトから呼出し。
            const messageList = await messengerContract.getOwnMessages();

            // メッセージ一覧のオブジェクトを Json 形式で返す
            // フロントエンドで保持するデータ型に変換
            const messageCleaned = messageList.map((message: Message) => {
                return {
                    // message. → コントラクトの Message で定義した変数名
                    sender: message.sender,
                    receiver: message.receiver,
                    depositInWei: message.depositInWei,
                    // Timestamp で格納されているので、Date型にする。 *1000 で、細かい単位を切り捨てる。
                    timestamp: new Date(message.timestamp.getTime() * 1000),
                    text: message.text,
                    isPending: message.isPending,
                };
            });

            // 自分宛てのメッセージを状態変数にセット
            setOwnMessages(messageCleaned);
        } catch (error) {
            console.log(error);
        }
    }

    /**
     *  メッセージを送信する → Post を呼び出す。
     */
    async function sendMessage({
        text,
        receiver,
        tokenInEther,
    }: SendMessageProps) {
        if (!messengerContract) return;
        try {
            // Ethereum を Wei に変換する。 → UIではトークンの単位はether
            const tokenInWei = ethers.parseEther(tokenInEther);

            // メッセージを送信する際に、トークンとガスリミットを指定する。
            // コントラクトの関数呼び出しには追加の引数Overridesを渡すことができます。
            /**
             * gasLimitはトランザクションに使用できるガス代に制限を設けています。
             * これは,送金先のプログラムの問題などで,ずっと処理が実行され続けて,
             * 送金手数料の支払いが無限に発生する（「ガス量」が無限に大きくなる）ことを防ぐためのものです。
             *  最大送金手数料はガス価格 × ガスリミットで計算されます。
             */
            const txn = await messengerContract.post(text, receiver, {
                gasLimit: 300000,
                value: tokenInWei,
            });

            // メッセージの結果をコンソールに表示
            console.log(
                'call post with ... receiver : %s,  token : %s',
                receiver,
                tokenInWei.toString()
            );
            // トランザクション実行前のハッシュ
            console.log('... Processing ... ', txn.hash);

            // プロセスをTrue に変えて、コントラクトが実行されたことを状態変数に格納する。
            setProcessing(true);

            // トランザクション実行後のハッシュ を表示
            await txn.wait();
            console.log('... Done ... ', txn.hash);

            // プロセスをFalse にする。 → どこでエラーが起きたのかがわかりやすくなる。
            setProcessing(false);

            // エラー処理
        } catch (error) {
            console.log(error);
        }
    }

    /**
     *  currentAccount, ethereum に変更があったら実行して再レンダーする。
     */
    useEffect(() => {
        getMessengerContract;
        getOwnMessages;
    }, [currentAccount, ethereum]);

    /**
     *  messengerContract の変更があったとき → イベントが発生した時 の処理
     *      → イベントリスナー → getOwnMessages を更新する
     *      → 送信イベントの発火時などに、UI を更新する。
     */
    useEffect(() => {
        /** イベント発火時の処理 */
        function onNewMessage(
            sender: string,
            receiver: string,
            depositInWei: BigNumberish,
            timestamp: Date,
            text: string,
            isPending: boolean
        ) {
            // 受取人のアドレス （全小文字にしたのも） が現在のアカウントと同一の場合に実施
            //      → currentAccount → ether の Metamask から取得しているのでに全て小文字。
            if (receiver.toLocaleLowerCase() === currentAccount) {
                // それまでのメッセージ ＋ イベントのメッセージ → 配列で引数に渡す。
                // prevMessages → ownMessages で取得できる値
                setOwnMessages((prevMessages) => [
                    ...prevMessages,
                    {
                        sender: sender,
                        receiver: receiver,
                        depositInWei: depositInWei,
                        // Timestamp で格納されているので、Date型にする。 *1000 で、細かい単位を切り捨てる。
                        timestamp: new Date(timestamp.getTime() * 1000),
                        text: text,
                        isPending: isPending,
                    },
                ]);
            }
        }

        // コントラクトが Null でない場合、イベントリスナを登録する。
        if (messengerContract) {
            // Contract.on("イベント名", イベントリスナ)とすることでイベントリスナを登録することができます。
            messengerContract.on('NewMessage', onNewMessage);
        }

        // 登録が繰り返されることを防ぐため, クリーンアップ関数として解除を行っています。
        // クリーンアップ関数について → https://zenn.dev/takuyakikuchi/articles/a96b8d97a0450c
        return () => {
            if (messengerContract) {
                messengerContract.off('NewMessage', onNewMessage);
            }
        };
    }, [messengerContract]);

    // オブジェクトをリターンする。
    return {
        processing,
        ownMessages,
        sendMessage,
    };
};
