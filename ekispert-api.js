// 駅すぱあとAPIを使って利用可能な鉄道会社を取得する関数
async function fetchAvailableRailways(userData) {
    try {
      // 出発駅と目的駅のコードを取得
      const departureStation = await getStationCode(userData.departure);
      const destinationStation = await getStationCode(userData.destination);
      
      // 鉄道会社情報を取得するAPI呼び出し
      const response = await axios.get(`${ekispertApiBaseUrl}/corporation`, {
        params: {
          key: ekispertApiKey,
          type: 'railway' // 鉄道会社のみ取得
        }
      });
      
      if (response.data && response.data.ResultSet && response.data.ResultSet.Corporation) {
        let corporations = response.data.ResultSet.Corporation;
        if (!Array.isArray(corporations)) {
          corporations = [corporations];
        }
        
        // 鉄道会社の情報を整形して返す
        return corporations.map(corp => ({
          id: corp.id,
          name: corp.Name
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching available railways:', error);
      throw error;
    }
  }
  
  // 駅コードを取得する関数
  async function getStationCode(stationName) {
    try {
      const response = await axios.get(`${ekispertApiBaseUrl}/station`, {
        params: {
          key: ekispertApiKey,
          name: stationName,
          type: 'train' // 鉄道駅のみ
        }
      });
      
      if (response.data && response.data.ResultSet && response.data.ResultSet.Point) {
        let stations = response.data.ResultSet.Point;
        if (!Array.isArray(stations)) {
          stations = [stations];
        }
        
        // 最初にヒットした駅のコードを返す
        if (stations.length > 0) {
          return stations[0].Station.code;
        }
      }
      
      throw new Error(`Station "${stationName}" not found`);
    } catch (error) {
      console.error(`Error getting station code for "${stationName}":`, error);
      throw error;
    }
  }
  
  // 選択された鉄道会社の路線を取得する関数
  async function fetchRoutesByRailway(railwayName) {
    try {
      // 鉄道会社のIDを取得（名前から検索）
      const corporations = await fetchAvailableRailways({});
      const corporation = corporations.find(corp => corp.name === railwayName);
      
      if (!corporation) {
        throw new Error(`Railway company "${railwayName}" not found`);
      }
      
      // 選択された鉄道会社の路線を取得
      const response = await axios.get(`${ekispertApiBaseUrl}/railway`, {
        params: {
          key: ekispertApiKey,
          corporationId: corporation.id
        }
      });
      
      if (response.data && response.data.ResultSet && response.data.ResultSet.Line) {
        let lines = response.data.ResultSet.Line;
        if (!Array.isArray(lines)) {
          lines = [lines];
        }
        
        // 路線情報を整形して返す
        return lines.map(line => ({
          id: line.id,
          name: line.Name
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching routes by railway:', error);
      throw error;
    }
  }
  
  // 時間をいっぱいに使ったルートを取得する関数
  async function fetchTimeConsumingRoutes(userData) {
    try {
      // 出発駅と目的駅のコードを取得
      const departureStationCode = await getStationCode(userData.departure);
      const destinationStationCode = await getStationCode(userData.destination);
      
      // 日付と時刻の整形
      const date = userData.date.replace(/-/g, ''); // YYYYMMDD形式に変換
      const departureTime = userData.departureTime.replace(':', ''); // HHMM形式に変換
      const arrivalTime = userData.arrivalTime.replace(':', ''); // HHMM形式に変換
      
      // 選択された鉄道会社と路線
      const railwayName = userData.selectedRailway;
      const routeName = userData.selectedRoute;
      
      // 経路探索のパラメータを設定
      const searchParams = {
        key: ekispertApiKey,
        from: departureStationCode,
        to: destinationStationCode,
        date: date,
        time: departureTime,
        searchType: 'departure', // 出発時刻指定
        plane: 'false', // 飛行機を除外
        shinkansen: 'false', // 新幹線を除外（乗り鉄向け）
        limitedExpress: 'false', // 特急を除外（乗り鉄向け）
        sort: 'time', // 所要時間順にソート
        count: 10 // 取得する経路数
      };
      
      // 経路探索API呼び出し
      const response = await axios.get(`${ekispertApiBaseUrl}/search/course/extreme`, {
        params: searchParams
      });
      
      // 経路情報を解析
      if (response.data && response.data.ResultSet && response.data.ResultSet.Course) {
        let courses = response.data.ResultSet.Course;
        if (!Array.isArray(courses)) {
          courses = [courses];
        }
        
        // 選択された鉄道会社と路線をなるべく使用し、
        // かつ出発時刻と到着時刻の間でできるだけ時間を使う経路を選択
        const filteredCourses = courses.filter(course => {
          // 経路に含まれる鉄道会社と路線を確認
          const includesSelectedRailway = course.Route.Line.some(line =>
            line.Corporation && line.Corporation.Name === railwayName
          );
          
          const includesSelectedRoute = course.Route.Line.some(line =>
            line.Name === routeName
          );
          
          // 到着時刻が指定範囲内か確認
          const courseArrivalTime = course.Route.Arrival.Time;
          const isWithinTimeRange = courseArrivalTime <= arrivalTime;
          
          return includesSelectedRailway && includesSelectedRoute && isWithinTimeRange;
        });
        
        // 時間をなるべく使う順（所要時間が長い順）にソート
        const sortedCourses = filteredCourses.sort((a, b) => {
          const timeA = parseInt(a.Route.timeOnBoard || 0);
          const timeB = parseInt(b.Route.timeOnBoard || 0);
          return timeB - timeA; // 降順ソート
        });
        
        // 上位3つの経路を返す
        return sortedCourses.slice(0, 3).map(course => {
          const departureStation = course.Route.Departure.Station.Name;
          const arrivalStation = course.Route.Arrival.Station.Name;
          const departureTime = course.Route.Departure.Time;
          const arrivalTime = course.Route.Arrival.Time;
          const timeRequired = course.Route.timeOnBoard || '不明';
          const fare = course.Price ? course.Price.Fare : '不明';
          
          // 経路の詳細（乗換駅など）を作成
          const routeDetails = course.Route.Line.map((line, index, arr) => {
            const lineName = line.Name;
            const fromStation = line.Station[0].Name;
            const toStation = line.Station[line.Station.length - 1].Name;
            
            return `${fromStation} [${lineName}] → ${toStation}`;
          }).join(' → ');
          
          return {
            title: `ルート${sortedCourses.indexOf(course) + 1}: ${departureStation}→${arrivalStation}`,
            description: `出発: ${departureTime.substring(0, 2)}:${departureTime.substring(2)} → 到着: ${arrivalTime.substring(0, 2)}:${arrivalTime.substring(2)}, 所要時間: ${timeRequired}分, 運賃: ${fare}円`,
            details: routeDetails
          };
        });
      }
      
      // API結果が無い場合は空配列を返す
      return [];
    } catch (error) {
      console.error('Error fetching time-consuming routes:', error);
      
      // エラー時はダミーデータを返す（実際のアプリでは適切なエラーハンドリングが必要）
      return [
        {
          title: 'ルート例: 東京→横浜',
          description: '申し訳ありませんが、指定された条件での経路検索に失敗しました。',
          details: 'APIエラー: ' + error.message
        }
      ];
    }
  }