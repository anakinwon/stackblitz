const StellarSdk = require('@stellar/stellar-sdk');

// Pi 테스트넷 서버 설정
// [수정됨] allowHttp: true 옵션 추가
const server = new StellarSdk.Horizon.Server('https://api.testnet.minepi.com', {
  allowHttp: true,
});

// --- [필수 수정] 아래 정보를 본인의 것으로 변경하세요 ---
const DISTRIBUTOR_PUBLIC_KEY =
  'GD3W3DGCYSNGXJJSE4L4224MY5DXCZJ2PQTKOLENJA7N5UGXPHMFCDLG';
const ISSUER_PUBLIC_KEY =
  'GDOCI7AZIH4ORRUFPE6J5HWJ2P2XP54TTBAJ6TDJ3TGEDXNJBR4J57RC';
const TOKEN_CODE = 'CBT'; // [필수 수정] 발행한 토큰명을 입력하세요

/**
 * 토큰 발행 상태 확인
 */
async function checkTokenStatus() {
  console.log('='.repeat(70));
  console.log(`🔍 ${TOKEN_CODE} 토큰 발행 상태 확인`);
  console.log('='.repeat(70));

  try {
    // 1. 금고 계정 확인
    console.log('\n📦 [1단계] 금고 계정 확인');
    console.log('-'.repeat(70));
    console.log(`계정 주소: ${DISTRIBUTOR_PUBLIC_KEY}`);

    const distributorAccount = await server.loadAccount(DISTRIBUTOR_PUBLIC_KEY);
    console.log('✅ 계정 존재 확인됨');

    // SPOT 토큰 잔액 확인
    const spotBalance = distributorAccount.balances.find(
      (b) =>
        b.asset_type !== 'native' &&
        b.asset_code === TOKEN_CODE &&
        b.asset_issuer === ISSUER_PUBLIC_KEY
    );

    if (spotBalance) {
      console.log(
        `\n💰 ${TOKEN_CODE} 토큰 잔액: ${spotBalance.balance} ${TOKEN_CODE}`
      );
      const balanceNumber = parseFloat(spotBalance.balance);
      const expectedAmount = 20000000;

      if (balanceNumber >= expectedAmount) {
        console.log('✅ 토큰 발행 성공! 예상량 이상의 토큰이 있습니다.');
      } else {
        console.log(
          `⚠️  토큰이 있지만 예상량(${expectedAmount})보다 적습니다.`
        );
      }

      if (spotBalance.limit) {
        console.log(`📊 최대 보유 한도: ${spotBalance.limit} ${TOKEN_CODE}`);
      }
    } else {
      console.log(`❌ ${TOKEN_CODE} 토큰이 발견되지 않았습니다.`);
      console.log(
        '   → 신뢰선이 설정되지 않았거나 토큰이 발행되지 않았을 수 있습니다.'
      );
    }

    // Test-Pi 잔액도 확인
    const nativeBalance = distributorAccount.balances.find(
      (b) => b.asset_type === 'native'
    );
    if (nativeBalance) {
      console.log(`\n💎 Test-Pi 잔액: ${nativeBalance.balance} (수수료용)`);
    }

    // 2. 발행자 계정 확인
    console.log('\n\n🏭 [2단계] 발행자 계정 확인');
    console.log('-'.repeat(70));
    console.log(`계정 주소: ${ISSUER_PUBLIC_KEY}`);

    try {
      const issuerAccount = await server.loadAccount(ISSUER_PUBLIC_KEY);
      console.log('✅ 계정 존재 확인됨');

      // 계정 잠금 상태 확인 (masterWeight가 0이면 잠금됨)
      const signers = issuerAccount.signers || [];
      const masterSigner = signers.find((s) => s.key === ISSUER_PUBLIC_KEY);

      if (masterSigner) {
        if (masterSigner.weight === 0) {
          console.log('🔒 계정이 잠겨있습니다 (추가 발행 불가) ✅');
        } else {
          console.log(
            `⚠️  계정이 잠겨있지 않습니다 (가중치: ${masterSigner.weight})`
          );
        }
      }

      const issuerNativeBalance = issuerAccount.balances.find(
        (b) => b.asset_type === 'native'
      );
      if (issuerNativeBalance) {
        console.log(`💎 Test-Pi 잔액: ${issuerNativeBalance.balance}`);
      }
    } catch (error) {
      console.log('❌ 발행자 계정을 찾을 수 없습니다.');
    }

    // 3. 최근 트랜잭션 확인
    console.log('\n\n📜 [3단계] 최근 트랜잭션 확인');
    console.log('-'.repeat(70));

    try {
      const transactions = await server
        .transactions()
        .forAccount(DISTRIBUTOR_PUBLIC_KEY)
        .order('desc')
        .limit(5)
        .call();

      console.log(`최근 ${transactions.records.length}개의 트랜잭션:`);
      transactions.records.forEach((tx, index) => {
        console.log(`\n${index + 1}. 트랜잭션 해시: ${tx.hash}`);
        console.log(`   Ledger: ${tx.ledger}`);
        console.log(`   시간: ${new Date(tx.created_at).toLocaleString()}`);
        console.log(
          `   링크: https://api.testnet.minepi.com/transactions/${tx.hash}`
        );
      });
    } catch (error) {
      console.log('⚠️  트랜잭션 조회 중 오류:', error.message);
    }

    // 4. 요약
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 최종 요약');
    console.log('='.repeat(70));

    if (spotBalance && parseFloat(spotBalance.balance) >= 20000000) {
      console.log('✅ 토큰 발행: 성공');
      console.log(
        `   금고 계정에 ${spotBalance.balance} ${TOKEN_CODE} 보유 중`
      );
    } else {
      console.log('❌ 토큰 발행: 실패 또는 미완료');
    }

    console.log('\n🌐 확인 방법:');
    console.log('   1. Pi Wallet 앱에서 토큰 목록 확인');
    console.log('   2. 웹 브라우저에서 확인:');
    console.log(
      `      - 계정: https://api.testnet.minepi.com/accounts/${DISTRIBUTOR_PUBLIC_KEY}`
    );
    console.log(
      `      - 토큰: https://api.testnet.minepi.com/assets?asset_code=${TOKEN_CODE}&asset_issuer=${ISSUER_PUBLIC_KEY}`
    );
    console.log('   3. pi.toml 파일 확인:');
    console.log('      (본인의 Netlify 주소)/.well-known/pi.toml');
  } catch (error) {
    console.error('\n❌ 확인 중 오류 발생:');
    console.error('에러 타입:', error.constructor.name);
    console.error('에러 메시지:', error.message);
    if (error.response) {
      console.error('HTTP 상태:', error.response.status);
    }
  }
}

// 실행
checkTokenStatus();
