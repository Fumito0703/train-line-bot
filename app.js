// app.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const line = require('@line/bot-sdk');
const axios = require('axios');

// 環境変数の設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// 駅すぱあとAPIの設定
const ekispertApiKey = process.env.EKISPERT_API_KEY;
const ekispertApiBaseUrl = 'https://api.ekispert.jp/v1/json';

// Express アプリの初期化
const app = express();
app.use(bodyParser.json());

// LINE Client の初期化
const client = new line.Client(config);

// ユーザーの状態を管理するための一時的なストレージ
// 実際のアプリでは、データベースを使用することを推奨
const userStates = {};

// ユーザーの入力状態を定義
const STATE = {
  IDLE: 'IDLE',
  INPUT_DEPARTURE: 'INPUT_DEPARTURE',
  INPUT_DESTINATION: 'INPUT_DESTINATION',
  INPUT_DATE: 'INPUT_DATE',
  INPUT_DEPARTURE_TIME: 'INPUT_DEPARTURE_TIME',
  INPUT_ARRIVAL_TIME: 'INPUT_ARRIVAL_TIME',
  SELECT_RAILWAY: 'SELECT_RAILWAY',
  SELECT_ROUTE: 'SELECT_ROUTE'
};

// Webhook エンドポイント
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// イベントハンドラ
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const userInput = event.message.text;

  // ユーザー状態の初期化（存在しない場合）
  if (!userStates[userId]) {
    userStates[userId] = {
      state: STATE.IDLE,
      data: {}
    };
  }

  // ユーザーのメッセージに応じて状態を更新
  try {
    return await processUserInput(userId, userInput);
  } catch (error) {
    console.error('Error processing user input:', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'エラーが発生しました。もう一度お試しください。'
    });
  }
}

// ユーザー入力の処理
async function processUserInput(userId, userInput) {
  const userState = userStates[userId];

  // 「出発」というキーワードで入力開始
  if (userInput === '出発') {
    userState.state = STATE.INPUT_DEPARTURE;
    userState.data = {}; // データをリセット
    return client.pushMessage(userId, {
      type: 'text',
      text: '出発駅を入力してください'
    });
  }

  // 状態に応じた処理
  switch (userState.state) {
    case STATE.INPUT_DEPARTURE:
      userState.data.departure = userInput;
      userState.state = STATE.INPUT_DESTINATION;
      return client.pushMessage(userId, {
        type: 'text',
        text: '目的駅を入力してください'
      });

    case STATE.INPUT_DESTINATION:
      userState.data.destination = userInput;
      userState.state = STATE.INPUT_DATE;
      return client.pushMessage(userId, {
        type: 'text',
        text: '出発日を入力してください（例: 2023-03-08）'
      });

    case STATE.INPUT_DATE:
      userState.data.date = userInput;
      userState.state = STATE.INPUT_DEPARTURE_TIME;
      return client.pushMessage(userId, {
        type: 'text',
        text: '出発時刻を入力してください（例: 10:00）'
      });

    case STATE.INPUT_DEPARTURE_TIME:
      userState.data.departureTime = userInput;
      userState.state = STATE.INPUT_ARRIVAL_TIME;
      return client.pushMessage(userId, {
        type: 'text',
        text: '到着時刻を入力してください（例: 18:00）'
      });

    case STATE.INPUT_ARRIVAL_TIME:
      userState.data.arrivalTime = userInput;
      userState.state = STATE.SELECT_RAILWAY;
      
      // 駅すぱあとAPIから利用可能な鉄道会社を取得
      try {
        const railways = await fetchAvailableRailways(userState.data);
        return client.pushMessage(userId, createRailwaySelectionMessage(railways));
      } catch (error) {
        console.error('Error fetching railways:', error);
        userState.state = STATE.IDLE;
        return client.pushMessage(userId, {
          type: 'text',
          text: '鉄道会社の取得に失敗しました。もう一度お試しください。'
        });
      }

    case STATE.SELECT_RAILWAY:
      userState.data.selectedRailway = userInput;
      userState.state = STATE.SELECT_ROUTE;
      
      // 選択された鉄道会社の路線を取得
      try {
        const routes = await fetchRoutesByRailway(userState.data.selectedRailway);
        return client.pushMessage(userId, createRouteSelectionMessage(routes));
      } catch (error) {
        console.error('Error fetching routes:', error);
        userState.state = STATE.IDLE;
        return client.pushMessage(userId, {
          type: 'text',
          text: '路線の取得に失敗しました。もう一度お試しください。'
        });
      }

    case STATE.SELECT_ROUTE:
      userState.data.selectedRoute = userInput;
      userState.state = STATE.IDLE;
      
      // 時間をいっぱいに使ったルートを取得
      try {
        const timeConsumingRoutes = await fetchTimeConsumingRoutes(userState.data);
        return client.pushMessage(userId, createRouteResultsMessage(timeConsumingRoutes));
      } catch (error) {
        console.error('Error fetching time-consuming routes:', error);
        return client.pushMessage(userId, {
          type: 'text',
          text: 'ルートの取得に失敗しました。もう一度お試しください。'
        });
      }

    default:
      return client.pushMessage(userId, {
        type: 'text',
        text: '「出発」と入力して、旅行計画を始めましょう！'
      });
  }
}

// 駅すぱあとAPIを使って利用可能な鉄道会社を取得する関数
async function fetchAvailableRailways(userData) {
  // 実際のAPI呼び出しのコードを実装
  // これはダミーデータ
  return [
    { id: '1', name: 'JR東日本' },
    { id: '2', name: '東京メトロ' },
    { id: '3', name: '東急電鉄' }
  ];
}

// 鉄道会社の選択メッセージを作成する関数
function createRailwaySelectionMessage(railways) {
  const items = railways.map(railway => ({
    type: 'button',
    action: {
      type: 'message',
      label: railway.name,
      text: railway.name
    }
  }));

  return {
    type: 'template',
    altText: '鉄道会社を選択してください',
    template: {
      type: 'buttons',
      text: '利用する鉄道会社を選択してください',
      actions: items.slice(0, 4) // LINEは最大4つのボタンまで
    }
  };
}

// 選択された鉄道会社の路線を取得する関数
async function fetchRoutesByRailway(railwayName) {
  // 実際のAPI呼び出しのコードを実装
  // これはダミーデータ
  return [
    { id: '101', name: '山手線' },
    { id: '102', name: '中央線' },
    { id: '103', name: '総武線' }
  ];
}

// 路線選択メッセージを作成する関数
function createRouteSelectionMessage(routes) {
  const items = routes.map(route => ({
    type: 'button',
    action: {
      type: 'message',
      label: route.name,
      text: route.name
    }
  }));

  return {
    type: 'template',
    altText: '路線を選択してください',
    template: {
      type: 'buttons',
      text: '利用する路線を選択してください',
      actions: items.slice(0, 4) // LINEは最大4つのボタンまで
    }
  };
}

// 時間をいっぱいに使ったルートを取得する関数
async function fetchTimeConsumingRoutes(userData) {
  // 実際には駅すぱあとAPIを使って、条件に合ったルートを取得
  // ここでは乗り鉄向けの「時間をいっぱいに使った」ルートを特定のロジックで検索

  // これはダミーデータ
  return [
    {
      title: 'ルート1: 山手線一周コース',
      description: '出発: 東京 → 目的: 東京, 所要時間: 1時間30分',
      details: '東京 → 新橋 → 品川 → 大崎 → 五反田 → 目黒 → 恵比寿 → 渋谷 → ... → 東京'
    },
    {
      title: 'ルート2: 中央線往復コース',
      description: '出発: 東京 → 目的: 東京, 所要時間: 3時間',
      details: '東京 → 神田 → 御茶ノ水 → 四ツ谷 → 新宿 → 中野 → ... → 高尾 → ... → 東京'
    },
    {
      title: 'ルート3: 総武線・横須賀線コース',
      description: '出発: 東京 → 目的: 東京, 所要時間: 4時間',
      details: '東京 → 新橋 → 品川 → 横浜 → ... → 千葉 → ... → 東京'
    }
  ];
}

// ルート結果メッセージを作成する関数
function createRouteResultsMessage(routes) {
  const messages = [];

  messages.push({
    type: 'text',
    text: '以下の3つのルートがオススメです！乗り鉄を楽しんでください！'
  });

  routes.forEach(route => {
    messages.push({
      type: 'text',
      text: `${route.title}\n${route.description}\n\n${route.details}`
    });
  });

  return messages;
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});