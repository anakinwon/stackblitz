// --- [중요] 여기에 설정할 변수 3개를 입력하세요 ---
// (절대 이 파일을 타인에게 유출하지 마세요)

const DISTRIBUTOR_SECRET_KEY =
  'SBVXUJVUMK343VTDGFVJEEYUDJHSLIMLHUIIZOKJ7MHYHC5WKXPNSKNW'; // 🏦 '금고' 유통 지갑의 비밀키
const USER_PUBLIC_KEY =
  'GDGYK23UTIYNQCIAZ3RZOMAHBJ5RTVTAKLAM7XIGM63IQSDQSYTEIREV'; // 👤 토큰을 받을 '유저'의 지갑 주소 (예: GABCD...)
const AMOUNT_TO_SEND = '1000000'; // 💰 보낼 토큰 수량 (예: '10')

// --- [설정] 토큰 정보 (수정할 필요 없음) ---
const ISSUER_PUBLIC_KEY =
  'GDOCI7AZIH4ORRUFPE6J5HWJ2P2XP54TTBAJ6TDJ3TGEDXNJBR4J57RC'; // 발행 지갑(잠겨진상태)
const TOKEN_CODE = 'CBT'; // 토큰명

// -----------------------------------------------------------------
// (아래 코드는 수정하지 마세요)
// -----------------------------------------------------------------

const StellarSdk = require('@stellar/stellar-sdk');

// Pi 테스트넷 서버 설정 (공식 문서 기준)
const server = new StellarSdk.Horizon.Server('https://api.testnet.minepi.com');
const networkPassphrase = 'Pi Testnet';

// 금고 지갑의 키 쌍 준비
const distributorKeys = StellarSdk.Keypair.fromSecret(DISTRIBUTOR_SECRET_KEY);

// SPOT 토큰 정의
const spotToken = new StellarSdk.Asset(TOKEN_CODE, ISSUER_PUBLIC_KEY);

/**
 * SPOT 토큰 전송 함수
 */
async function sendSpotToken() {
  console.log('='.repeat(70));
  console.log('🚀 토큰 전송 시작');
  console.log('='.repeat(70));

  try {
    // 1. 금고 계정 로드 (공식 문서: 각 트랜잭션마다 계정을 재로드하여 최신 시퀀스 번호 사용)
    console.log('\n[1단계] 금고 계정 로드 중...');
    const distributorAccount = await server.loadAccount(
      distributorKeys.publicKey()
    );
    console.log(
      `  ✅ 계정 로드 완료 (시퀀스: ${distributorAccount.sequenceNumber()})`
    );

    // 잔액 확인
    const balances = distributorAccount.balances || [];
    const spotBalance = balances.find(
      (b) =>
        b.asset_type !== 'native' &&
        b.asset_code === TOKEN_CODE &&
        b.asset_issuer === ISSUER_PUBLIC_KEY
    );

    if (!spotBalance) {
      throw new Error(`금고 계정에 ${TOKEN_CODE} 토큰이 없습니다.`);
    }

    const currentBalance = parseFloat(spotBalance.balance);
    const sendAmount = parseFloat(AMOUNT_TO_SEND);

    console.log(`  💰 현재 토큰 잔액: ${spotBalance.balance}`);
    console.log(`  📤 전송할 수량: ${AMOUNT_TO_SEND}`);

    if (currentBalance < sendAmount) {
      throw new Error(
        `잔액이 부족합니다. (현재: ${currentBalance}, 필요: ${sendAmount})`
      );
    }

    // 2. 수신자 계정 확인
    console.log('\n[2단계] 수신자 계정 확인 중...');
    console.log(`  수신자 주소: ${USER_PUBLIC_KEY}`);

    try {
      const userAccount = await server.loadAccount(USER_PUBLIC_KEY);
      console.log('  ✅ 수신자 계정 존재 확인됨');

      // 수신자가 SPOT 토큰 신뢰선을 설정했는지 확인
      const hasTrustline = userAccount.balances.some(
        (b) =>
          b.asset_type !== 'native' &&
          b.asset_code === TOKEN_CODE &&
          b.asset_issuer === ISSUER_PUBLIC_KEY
      );

      if (!hasTrustline) {
        console.log('  ❌ 오류: 수신자가 토큰 신뢰선을 설정하지 않았습니다.');
        console.log('\n' + '='.repeat(70));
        console.log('🚫 전송 중단');
        console.log('='.repeat(70));
        console.log('해결 방법:');
        console.log('  1. 수신자가 Pi Wallet 앱을 엽니다.');
        console.log("  2. 'Tokens' 메뉴로 이동합니다.");
        console.log('  3. 토큰을 찾아 활성화(Enable)합니다.');
        console.log('  4. 활성화 후 다시 이 스크립트를 실행하세요.');
        console.log('='.repeat(70));
        process.exit(1);
      } else {
        console.log('  ✅ 토큰 신뢰선 확인됨');
      }
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('  ⚠️  경고: 수신자 계정이 존재하지 않습니다.');
        console.log('     → Pi Wallet에서 계정을 활성화해야 합니다.');
        throw new Error('수신자 계정이 존재하지 않습니다.');
      } else {
        throw error;
      }
    }

    // 3. 네트워크 정보 확인 (Base Fee 가져오기)
    console.log('\n[3단계] 네트워크 정보 확인 중...');
    const response = await server.ledgers().order('desc').limit(1).call();
    const latestBlock = response.records[0];
    const baseFee = latestBlock.base_fee_in_stroops;
    console.log(`  Base Fee: ${baseFee} stroops`);
    console.log(`  Ledger 번호: ${latestBlock.sequence}`);

    // 4. Timebounds 설정 (공식 문서 기준)
    console.log('\n[4단계] Timebounds 설정 중...');
    const timebounds = await server.fetchTimebounds(90);
    console.log(
      `  유효 시간: ${new Date(
        timebounds.minTime * 1000
      ).toISOString()} ~ ${new Date(timebounds.maxTime * 1000).toISOString()}`
    );

    // 5. Payment 트랜잭션 생성
    console.log('\n[5단계] Payment 트랜잭션 생성 중...');
    const transaction = new StellarSdk.TransactionBuilder(distributorAccount, {
      fee: baseFee,
      networkPassphrase: networkPassphrase,
      timebounds: timebounds,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: USER_PUBLIC_KEY,
          asset: spotToken,
          amount: AMOUNT_TO_SEND,
        })
      )
      .build();

    console.log(`  트랜잭션 해시: ${transaction.hash().toString('hex')}`);
    console.log(`  수수료: ${transaction.fee} stroops`);

    // 6. 트랜잭션 서명
    console.log('\n[6단계] 트랜잭션 서명 중...');
    transaction.sign(distributorKeys);
    console.log('  ✅ 서명 완료');

    // 7. 트랜잭션 전송
    console.log('\n[7단계] 트랜잭션 전송 중...');
    const result = await server.submitTransaction(transaction);

    // 8. 성공 메시지
    console.log('\n' + '='.repeat(70));
    console.log('✅ 전송 성공!');
    console.log('='.repeat(70));
    console.log(`📤 전송량: ${AMOUNT_TO_SEND} ${TOKEN_CODE}`);
    console.log(`👤 수신자: ${USER_PUBLIC_KEY}`);
    console.log(`🔗 트랜잭션 링크: ${result._links.transaction.href}`);
    console.log(`📊 Ledger: ${result.ledger}`);
    console.log(`🔐 해시: ${result.hash}`);
    console.log('='.repeat(70));
  } catch (error) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ 전송 실패');
    console.error('='.repeat(70));

    console.error('에러 타입:', error.constructor.name);
    console.error('에러 메시지:', error.message);

    if (error.response) {
      console.error('HTTP 상태 코드:', error.response.status);
      console.error(
        '응답 URL:',
        error.response.config?.url ||
          error.response.request?.responseURL ||
          'N/A'
      );

      if (error.response.data) {
        console.error('\n응답 데이터:');
        console.error(JSON.stringify(error.response.data, null, 2));

        if (error.response.data.extras?.result_codes) {
          console.error('\n트랜잭션 결과 코드:');
          console.error('  전체:', error.response.data.extras.result_codes);
          if (error.response.data.extras.result_codes.transaction) {
            console.error(
              '  트랜잭션:',
              error.response.data.extras.result_codes.transaction
            );
          }
          if (error.response.data.extras.result_codes.operations) {
            console.error(
              '  작업들:',
              error.response.data.extras.result_codes.operations
            );
          }
        }
      }
    } else if (error.stack) {
      console.error('\n스택 트레이스:');
      console.error(error.stack);
    }

    console.error('='.repeat(70));
    process.exit(1);
  }
}

// 스크립트 실행
sendSpotToken();
