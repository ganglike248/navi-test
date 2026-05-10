import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SafeAreaView, View, AppState, Alert } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import main from './styles/main';

import MapView from './MapView';
import ListView from './ListView';

const styles = main;

const PickupDeliverPage = () => {
  // 기본 상태 관리
  const [activeTab, setActiveTab] = useState('미완료');
  const [location, setLocation] = useState(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pickupList, setPickupList] = useState([]);
  const [selectedPickup, setSelectedPickup] = useState(null);
  const [pickupDetails, setPickupDetails] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [showListModal, setShowListModal] = useState(true);
  const [pickupCoordinates, setPickupCoordinates] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // 'list' 또는 'map' 모드
  
  // 다중 선택 관련 상태
  const [selectedPickups, setSelectedPickups] = useState([]);
  const [routeOptimized, setRouteOptimized] = useState(true);
  
  // WebView 참조
  const mapWebViewRef = useRef(null);
  
  // 모드 전환 함수
  const toggleViewMode = () => {
    const newMode = viewMode === 'list' ? 'map' : 'list';
    setViewMode(newMode);
  };

  // 여러 수거지를 한 번에 선택하는 함수 (새로 추가)
  const setSelectedPickupsDirectly = useCallback((newPickups) => {
    console.log('부모에서 한 번에 선택:', newPickups.length, '개');
    
    // newPickups가 pickup 객체 배열인 경우, 좌표 정보로 변환
    const coordinatePickups = newPickups.map(pickup => {
      // 이미 좌표 정보 형태라면 그대로 사용
      if (pickup.latitude && pickup.longitude) {
        return pickup;
      }
      
      // pickup 객체라면 좌표 정보 찾기
      const pickupCoord = pickupCoordinates.find(c => 
        c.id === pickup.pickupId || c.id === pickup.id
      );
      
      if (pickupCoord) {
        return {
          id: pickup.pickupId || pickup.id,
          latitude: pickupCoord.latitude,
          longitude: pickupCoord.longitude,
          name: pickupCoord.name,
          address: pickupCoord.address,
          pickup: pickup
        };
      }
      
      return null;
    }).filter(Boolean); // null 값 제거
    
    setSelectedPickups(coordinatePickups);
  }, [pickupCoordinates]);
  
  // 위치 권한 요청 및 현재 위치 가져오기
  useEffect(() => {
    const getLocationPermission = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            '위치 권한 필요',
            '이 앱은 사용자의 위치 권한을 필요로 합니다.'
          );
          setHasPermission(false);
          // 기본 위치 설정 (서울)
          setLocation({
            latitude: 37.566826,
            longitude: 126.9786567
          });
          setIsLoading(false);
        } else {
          setHasPermission(true);
          getCurrentLocation();
        }
      } catch (error) {
        console.error('위치 권한 요청 오류:', error);
        setHasPermission(false);
        setIsLoading(false);
      }
    };

    const getCurrentLocation = async () => {
      try {
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High
        });
        setLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setIsLoading(false);
      } catch (error) {
        console.error('위치 정보를 가져오는 데 실패했습니다:', error);
        // 기본 위치 설정 (서울)
        setLocation({
          latitude: 37.566826,
          longitude: 126.9786567
        });
        setIsLoading(false);
      }
    };

    getLocationPermission();
  }, []);

  // 오늘 날짜 가져오기 (YYYY-MM-DD 형식)
  const getToday = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 두 지점 간 거리 계산 (Haversine 공식)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // 지구 반지름 (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // 현재 위치에서 가장 가까운 수거지부터 시간순으로 정렬
  const sortPickupsByDistanceAndTime = (pickups, currentLocation) => {
    if (!pickups || pickups.length === 0 || !currentLocation) return [];

    // 1. 시간 순으로 먼저 정렬 (빠른 시간 우선)
    const sortedByTime = [...pickups].sort((a, b) => {
      if (!a.pickupDate && !b.pickupDate) return 0;
      if (!a.pickupDate) return 1;
      if (!b.pickupDate) return -1;
      
      const dateA = new Date(a.pickupDate);
      const dateB = new Date(b.pickupDate);
      return dateA - dateB;
    });

    // 2. 각 수거지에 현재 위치로부터의 거리 정보 추가
    const pickupsWithDistance = sortedByTime.map(pickup => {
      const coord = pickupCoordinates.find(c => c.id === pickup.pickupId);
      if (!coord) return { ...pickup, distance: Infinity };

      const distance = calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        coord.latitude,
        coord.longitude
      );

      return {
        ...pickup,
        distance,
        coordinates: coord
      };
    });

    // 3. 시간대별로 그룹화 (1시간 단위)
    const timeGroups = {};
    pickupsWithDistance.forEach(pickup => {
      if (!pickup.pickupDate) {
        timeGroups['무시간'] = timeGroups['무시간'] || [];
        timeGroups['무시간'].push(pickup);
        return;
      }

      const date = new Date(pickup.pickupDate);
      const hour = date.getHours();
      const timeKey = `${String(hour).padStart(2, '0')}시`;
      
      timeGroups[timeKey] = timeGroups[timeKey] || [];
      timeGroups[timeKey].push(pickup);
    });

    // 4. 각 시간대 내에서 거리순으로 정렬
    Object.keys(timeGroups).forEach(timeKey => {
      timeGroups[timeKey].sort((a, b) => a.distance - b.distance);
    });

    // 5. 시간순으로 재조합
    const result = [];
    Object.keys(timeGroups)
      .sort() // 시간순 정렬
      .forEach(timeKey => {
        result.push(...timeGroups[timeKey]);
      });

    return result;
  };

  // 조합 생성 함수 (nCr)
  const getCombinations = (array, size) => {
    if (size > array.length) return [array];
    if (size === 1) return array.map(item => [item]);
    if (size === array.length) return [array];

    const combinations = [];
    
    for (let i = 0; i <= array.length - size; i++) {
      const head = array[i];
      const tailCombinations = getCombinations(array.slice(i + 1), size - 1);
      for (const tail of tailCombinations) {
        combinations.push([head, ...tail]);
      }
    }
    
    return combinations;
  };

  // 경로 순서 최적화 (근사 TSP 알고리즘)
  const optimizeRouteOrder = (pickups, distanceMatrix, allPickups) => {
    if (pickups.length <= 1) return pickups;

    // 현재 위치(인덱스 0)에서 시작하여 가장 가까운 점을 순차적으로 방문
    const visited = new Set();
    const route = [];
    let currentIndex = 0; // 현재 위치부터 시작

    while (route.length < pickups.length) {
      let nearestIndex = -1;
      let nearestDistance = Infinity;

      for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        const pickupIndex = allPickups.indexOf(pickup) + 1; // +1은 현재위치(0) 때문
        
        if (!visited.has(i)) {
          const distance = distanceMatrix[currentIndex][pickupIndex];
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = i;
          }
        }
      }

      if (nearestIndex !== -1) {
        visited.add(nearestIndex);
        route.push(pickups[nearestIndex]);
        currentIndex = allPickups.indexOf(pickups[nearestIndex]) + 1;
      }
    }

    return route;
  };

  // 총 거리 계산
  const calculateTotalDistance = (route, distanceMatrix, allPickups) => {
    if (route.length === 0) return 0;

    let totalDistance = 0;
    let currentIndex = 0; // 현재 위치에서 시작

    for (const pickup of route) {
      const pickupIndex = allPickups.indexOf(pickup) + 1;
      totalDistance += distanceMatrix[currentIndex][pickupIndex];
      currentIndex = pickupIndex;
    }

    return totalDistance;
  };

  // TSP(외판원 문제) 알고리즘을 사용한 최적 경로 계산
  const calculateOptimalRoute = async (pickups, currentLocation) => {
    try {
      // 거리 매트릭스 생성
      const locations = [currentLocation]; // 시작점: 현재 위치
      const pickupsWithCoords = [];

      // 좌표가 있는 수거지만 필터링
      for (const pickup of pickups) {
        const coord = pickupCoordinates.find(c => c.id === pickup.pickupId);
        if (coord) {
          locations.push({
            latitude: coord.latitude,
            longitude: coord.longitude
          });
          pickupsWithCoords.push({
            ...pickup,
            coordinates: coord
          });
        }
      }

      if (pickupsWithCoords.length === 0) {
        return [];
      }

      // 거리 매트릭스 계산
      const distanceMatrix = [];
      for (let i = 0; i < locations.length; i++) {
        distanceMatrix[i] = [];
        for (let j = 0; j < locations.length; j++) {
          if (i === j) {
            distanceMatrix[i][j] = 0;
          } else {
            distanceMatrix[i][j] = calculateDistance(
              locations[i].latitude,
              locations[i].longitude,
              locations[j].latitude,
              locations[j].longitude
            );
          }
        }
      }

      // 3개 이하면 단순히 가까운 순서로 정렬
      if (pickupsWithCoords.length <= 3) {
        return pickupsWithCoords
          .sort((a, b) => {
            const distA = distanceMatrix[0][pickupsWithCoords.indexOf(a) + 1];
            const distB = distanceMatrix[0][pickupsWithCoords.indexOf(b) + 1];
            return distA - distB;
          });
      }

      // 3개 수거지의 최적 조합 찾기 (조합론 사용)
      const combinations = getCombinations(pickupsWithCoords, 3);
      let bestCombination = null;
      let shortestDistance = Infinity;

      for (const combination of combinations) {
        // 각 조합에 대해 최적 순서 계산
        const optimizedOrder = optimizeRouteOrder(combination, distanceMatrix, pickupsWithCoords);
        const totalDistance = calculateTotalDistance(optimizedOrder, distanceMatrix, pickupsWithCoords);

        if (totalDistance < shortestDistance) {
          shortestDistance = totalDistance;
          bestCombination = optimizedOrder;
        }
      }

      return bestCombination || pickupsWithCoords.slice(0, 3);

    } catch (error) {
      console.error('최적 경로 계산 오류:', error);
      // 오류 발생 시 거리순으로 3개 반환
      return sortPickupsByDistanceAndTime(pickups, currentLocation).slice(0, 3);
    }
  };

  // 3개씩 자동 경유지 선택 (최단 경로 기반) - 이제 사용되지 않음
  const autoSelectOptimalRoute = async () => {
    try {
      if (!location || !pickupList || pickupList.length === 0) {
        Alert.alert('오류', '현재 위치 또는 수거지 정보가 없습니다.');
        return;
      }

      // 미완료 수거지만 필터링
      const incompletePickups = pickupList.filter(pickup => !pickup.isCompleted);
      
      if (incompletePickups.length === 0) {
        Alert.alert('알림', '완료되지 않은 수거지가 없습니다.');
        return;
      }

      // 현재 위치 기준으로 최적 경로 계산
      const optimizedPickups = await calculateOptimalRoute(incompletePickups, location);
      
      // 최대 3개까지 선택
      const selectedCount = Math.min(3, optimizedPickups.length);
      const autoSelected = optimizedPickups.slice(0, selectedCount);

      // setSelectedPickupsDirectly 함수 사용
      setSelectedPickupsDirectly(autoSelected);

      // 결과 알림
      const distances = autoSelected.map(pickup => 
        calculateDistance(
          location.latitude, 
          location.longitude,
          pickup.coordinates.latitude,
          pickup.coordinates.longitude
        ).toFixed(1)
      );

      Alert.alert(
        '자동 경로 선택 완료',
        `${selectedCount}개 수거지가 최적 경로로 선택되었습니다.\n\n` +
        autoSelected.map((pickup, index) => 
          `${index + 1}. ${pickup.address?.name || '수거지'} (${distances[index]}km)`
        ).join('\n'),
        [{ text: '확인' }]
      );

    } catch (error) {
      console.error('자동 경로 선택 오류:', error);
      Alert.alert('오류', '자동 경로 선택 중 오류가 발생했습니다.');
    }
  };

  // 자동 선택 초기화
  const clearAutoSelection = useCallback(() => {
    setSelectedPickups([]);
    console.log('선택 초기화됨');
  }, []);

  // 주소를 좌표로 변환하는 함수 (카카오맵 API 사용)
  const geocodeAddress = async (address) => {
    if (!address) {
      console.error('지오코딩 요청 실패: 주소가 비어 있습니다.');
      return null;
    }
    
    try {
      // 카카오맵 API 키
      const KAKAO_API_KEY = '90fc3c147a2997ec441fd2cd8e87e2a8';
      
      console.log('지오코딩 요청 주소:', address);

      // 주소 검색 API 호출
      const response = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `KakaoAK ${KAKAO_API_KEY}`,
            'Content-Type': 'application/json;charset=UTF-8'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('주소 검색에 실패했습니다');
      }
      
      const data = await response.json();
      
      // 검색 결과가 없는 경우
      if (data.documents.length === 0) {
        console.warn('주소에 대한 좌표 정보를 찾을 수 없습니다:', address);
        return null;
      }
      
      // 첫 번째 결과의 좌표 반환
      const { x, y } = data.documents[0];
      
      // 좌표 유효성 검사
      const longitude = parseFloat(x);
      const latitude = parseFloat(y);
      
      if (isNaN(longitude) || isNaN(latitude)) {
        console.error('지오코딩 결과가 유효한 숫자가 아닙니다:', x, y);
        return null;
      }
      
      console.log(`지오코딩 성공 - 주소: ${address}, 좌표: ${latitude}, ${longitude}`);
      
      return {
        longitude: longitude,
        latitude: latitude
      };
    } catch (error) {
      console.error('주소 지오코딩 오류:', error);
      return null;
    }
  };

  // 수거지 목록 가져오기
  useEffect(() => {
    fetchPickups();
  }, []);

  const fetchPickups = async () => {
    try {
      setIsLoading(true);
     
      
      // API 호출
      const response = await fetch(
        `https://refresh-f5-server.o-r.kr/api/pickup/get-today-pickup?today=${getToday()}`,
        { 
          method: 'GET', 
          headers: { 
            'Content-Type': 'application/json',
            // 'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('수거지 목록을 불러오는데 실패했습니다');
      }
      
      const data = await response.json();
      
      // 데이터 유효성 검사
      if (!Array.isArray(data)) {
        console.error('서버에서 받은 수거지 데이터가 배열이 아닙니다:', data);
        throw new Error('수거지 데이터 형식이 올바르지 않습니다');
      }
      
      console.log(`수거지 데이터 ${data.length}개 로드 완료`);
      setPickupList(data);
      
      // 수거지 주소를 좌표로 변환하고 마커 정보 생성
      console.log('수거지 좌표 변환 시작...');
      const coordinates = await Promise.all(
        data.map(async (pickup, index) => {
          // pickup 객체 유효성 검사
          if (!pickup || !pickup.address || !pickup.address.roadNameAddress) {
            console.error(`수거지 #${index} 주소 정보 누락:`, pickup);
            return null;
          }
          
          const addressStr = pickup.address.roadNameAddress;
          const coords = await geocodeAddress(addressStr);
          
          if (coords) {
            return {
              id: pickup.pickupId,
              latitude: coords.latitude,
              longitude: coords.longitude,
              name: pickup.address.name || '수거지',
              address: pickup.address.roadNameAddress,
              pickup: pickup // 원본 데이터도 함께 저장
            };
          }
          console.warn(`수거지 #${index}(${pickup.pickupId}) 좌표 변환 실패`);
          return null;
        })
      );
      
      // null 값 제거
      const validCoordinates = coordinates.filter(coord => coord !== null);
      console.log(`${validCoordinates.length}/${data.length} 수거지 좌표 변환 성공`);
      
      // 좌표 정보 유효성 검사
      const verifiedCoordinates = validCoordinates.filter(coord => {
        if (typeof coord.latitude !== 'number' || typeof coord.longitude !== 'number' ||
            isNaN(coord.latitude) || isNaN(coord.longitude)) {
          console.error('유효하지 않은 좌표 정보:', coord);
          return false;
        }
        return true;
      });
      
      if (verifiedCoordinates.length < validCoordinates.length) {
        console.warn(`${validCoordinates.length - verifiedCoordinates.length}개의 유효하지 않은 좌표 정보가 필터링되었습니다.`);
      }
      
      setPickupCoordinates(verifiedCoordinates);
      
    } catch (error) {
      console.error('수거지 목록 조회 오류:', error);
      Alert.alert('데이터 오류', '수거지 목록을 불러올 수 없습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 수거지 상세 정보 가져오기
  const fetchPickupDetails = async (pickupId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        Alert.alert('로그인 필요', '로그인이 필요합니다.');
        return;
      }
      
      // API 호출
      const response = await fetch(
        `https://refresh-f5-server.o-r.kr/api/pickup/get-details?pickupId=${pickupId}`,
        { 
          method: 'GET', 
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('수거지 상세 정보를 불러오는데 실패했습니다');
      }
      
      const data = await response.json();
      setPickupDetails(data);
    } catch (error) {
      console.error('수거지 상세 조회 오류:', error);
      Alert.alert('데이터 오류', '수거지 상세 정보를 불러올 수 없습니다.');
    }
  };

  // 마커 클릭 시 수거지 상세 정보 표시
  const handleMarkerClick = (pickup) => {
    setSelectedPickup(pickup);
    fetchPickupDetails(pickup.pickupId);
  };

  // 수거지 다중 선택 처리
  const togglePickupSelection = useCallback((pickup) => {
    // 이미 선택된 경우 제거, 아니면 추가
    const isAlreadySelected = selectedPickups.some(p => p.id === pickup.pickupId);
    
    if (isAlreadySelected) {
      setSelectedPickups(prev => prev.filter(p => p.id !== pickup.pickupId));
    } else {
      // 해당 수거지의 좌표 정보 찾기
      const pickupCoord = pickupCoordinates.find(c => c.id === pickup.pickupId);
      if (pickupCoord) {
        // 좌표 정보 유효성 검사
        if (typeof pickupCoord.latitude === 'number' && typeof pickupCoord.longitude === 'number') {
          setSelectedPickups(prev => [...prev, pickupCoord]);
          console.log(`수거지 추가 - ID: ${pickupCoord.id}, 좌표: ${pickupCoord.latitude}, ${pickupCoord.longitude}`);
        } else {
          console.error('유효하지 않은 좌표 정보:', pickupCoord);
          Alert.alert('오류', '이 수거지의 좌표 정보가 유효하지 않아 선택할 수 없습니다.');
        }
      } else {
        console.error('수거지 좌표 정보를 찾을 수 없음:', pickup.pickupId);
        Alert.alert('오류', '이 수거지의 좌표 정보를 찾을 수 없습니다.');
      }
    }
  }, [selectedPickups, pickupCoordinates]);
  
  // 경로 최적화 토글
  const toggleRouteOptimization = useCallback(() => {
    setRouteOptimized(prev => !prev);
  }, []);

  // 수거 완료 처리
  const completePickup = async (pickupId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        Alert.alert('로그인 필요', '로그인이 필요합니다.');
        return;
      }

      Alert.alert(
        '수거 완료',
        '이 수거지를 완료 처리하시겠습니까?',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '완료',
            onPress: async () => {
              try {
                const response = await fetch(
                  'https://refresh-f5-server.o-r.kr/api/pickup/complete',
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ pickupId })
                  }
                );

                if (!response.ok) {
                  throw new Error('수거 완료 처리에 실패했습니다');
                }

                // 목록 새로고침
                fetchPickups();
                
                // 선택된 수거지에서 제거
                setSelectedPickups(selectedPickups.filter(p => p.id !== pickupId));

                Alert.alert('완료', '수거가 완료되었습니다.');
              } catch (error) {
                console.error('수거 완료 처리 오류:', error);
                Alert.alert('오류', '수거 완료 처리 중 오류가 발생했습니다.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('수거 완료 처리 오류:', error);
      Alert.alert('오류', '수거 완료 처리 중 오류가 발생했습니다.');
    }
  };

  // 내장형 내비게이션 시작
  const startInAppNavigation = () => {
    if (selectedPickups.length === 0) {
      Alert.alert('선택 필요', '최소한 하나 이상의 수거지를 선택해주세요.');
      return;
    }
    
    // 지도 모드로 전환
    setViewMode('map');
    
    // MapView 컴포넌트에서 내비게이션 시작 처리
    // (MapView 컴포넌트 내부에서 구현)
  };

  // 기존 launchKakaoNavigation 함수를 대체
  const launchNavigation = () => {
    startInAppNavigation();
  };

  // 선택 모두 초기화
  const clearAllSelections = () => {
    setSelectedPickups([]);
  };

  // 위치 업데이트 타이머
  useEffect(() => {
    const locationUpdateInterval = setInterval(() => {
      if (hasPermission) {
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High
        }).then(({ coords }) => {
          setLocation({
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
        }).catch(error => {
          console.error('위치 업데이트 오류:', error);
        });
      }
    }, 15000); // 15초마다 위치 업데이트
    
    return () => {
      clearInterval(locationUpdateInterval);
    };
  }, [hasPermission]);

  // 앱 상태 변경 감지 (포그라운드로 돌아왔을 때 데이터 새로고침)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        fetchPickups();
      }
    });
    
    return () => {
      subscription.remove();
    };
  }, []);

  // 메인 렌더링
  return (
    <SafeAreaView style={styles.container}>
      {viewMode === 'list' ? (
        <ListView 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pickupList={pickupList}
          selectedPickups={selectedPickups}
          togglePickupSelection={togglePickupSelection}
          routeOptimized={routeOptimized}
          toggleRouteOptimization={toggleRouteOptimization}
          startRouteWithSelectedPickups={startInAppNavigation}
          toggleViewMode={toggleViewMode}
          launchKakaoNavigation={launchNavigation}
          completePickup={completePickup}
          // 기존 props들
          autoSelectOptimalRoute={autoSelectOptimalRoute}
          clearAutoSelection={clearAutoSelection}
          location={location}
          pickupCoordinates={pickupCoordinates}
          calculateDistance={calculateDistance}
          // 새로 추가된 핵심 prop
          setSelectedPickups={setSelectedPickupsDirectly}
        />
      ) : (
        <MapView 
          location={location}
          isLoading={isLoading}
          pickupCoordinates={pickupCoordinates}
          selectedPickups={selectedPickups}
          routeOptimized={routeOptimized}
          toggleViewMode={toggleViewMode}
          clearAllSelections={clearAllSelections}
          handleMarkerClick={handleMarkerClick}
          webViewRef={mapWebViewRef}
          launchKakaoNavigation={launchNavigation}
        />
      )}
    </SafeAreaView>
  );
};

export default PickupDeliverPage;