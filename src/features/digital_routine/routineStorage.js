'use strict';

/**
 * chrome.storage.local에서 hourlyBlocks 데이터를 읽어옵니다.
 * 데이터가 없으면 초기화된 배열(모든 값이 'N/A')을 반환합니다.
 * @returns {Promise<string[]>} hourlyBlocks 데이터 배열
 */
export async function getHourlyBlocks() {
  try {
    const result = await chrome.storage.local.get(['hourlyBlocks']);
    if (result.hourlyBlocks && Array.isArray(result.hourlyBlocks) && result.hourlyBlocks.length === 144) {
      return result.hourlyBlocks;
    } else {
      // 데이터가 없거나 형식이 맞지 않으면 초기화된 배열 반환
      console.log('No valid hourlyBlocks found in storage, initializing.');
      const initialBlocks = Array(144).fill('N/A');
      // 초기화된 데이터를 스토리지에 저장할 수도 있습니다.
      // await saveHourlyBlocks(initialBlocks);
      return initialBlocks;
    }
  } catch (error) {
    console.error('Error getting hourlyBlocks from storage:', error);
    // 오류 발생 시에도 초기화된 배열 반환
    return Array(144).fill('N/A');
  }
}

/**
 * chrome.storage.local에 hourlyBlocks 데이터를 저장합니다.
 * @param {string[]} hourlyBlocks - 저장할 hourlyBlocks 데이터 배열 (크기 144)
 * @returns {Promise<void>}
 */
export async function saveHourlyBlocks(hourlyBlocks) {
  if (!Array.isArray(hourlyBlocks) || hourlyBlocks.length !== 144) {
    console.error('Invalid hourlyBlocks data provided for saving.', hourlyBlocks);
    return;
  }
  try {
    await chrome.storage.local.set({ hourlyBlocks });
    console.log('hourlyBlocks saved to storage.', hourlyBlocks);
  } catch (error) {
    console.error('Error saving hourlyBlocks to storage:', error);
  }
} 