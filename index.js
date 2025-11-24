// --- [중요] 여기에 2개의 '비밀키(Seed)'를 입력하세요 ---
// (절대 이 파일을 타인에게 유출하지 마세요)

const ISSUER_SECRET_KEY =
  'SARNFVAVZUXJZZUSLTDMOPDBIEESHNLKZMDC7QYU53AGLNMWRDQ4ALLC'; // 🏭 '공장' (잠길 지갑)의 비밀키
const DISTRIBUTOR_SECRET_KEY =
  'SBVXUJVUMK343VTDGFVJEEYUDJHSLIMLHUIIZOKJ7MHYHC5WKXPNSKNW'; // 🏦 '금고' (유통 지갑)의 비밀키

// --- [설정] 토큰 정보  ---
const ISSUER_PUBLIC_KEY =
  'GDOCI7AZIH4ORRUFPE6J5HWJ2P2XP54TTBAJ6TDJ3TGEDXNJBR4J57RC'; // 🏭 '공장' (잠길 지갑)의 지갑주소
const DISTRIBUTOR_PUBLIC_KEY =
  'GD3W3DGCYSNGXJJSE4L4224MY5DXCZJ2PQTKOLENJA7N5UGXPHMFCDLG'; // 🏦 '금고' (유통 지갑)의 지갑주소
const TOKEN_CODE = 'CBT'; // [필수 수정] 발행할 토큰 이름을 입력하세요 (예: TCCB)
const TOKEN_AMOUNT = '100000000'; // 토큰 발행량 1억 개

// -----------------------------------------------------------------
// (아래 코드는 수정하지 마세요)
// -----------------------------------------------------------------

const StellarSdk = require('@stellar/stellar-sdk');

// Pi 테스트넷 서버 설정 (공식 문서 기준)
const server = new StellarSdk.Horizon.Server('https://api.testnet.minepi.com');
const networkPassphrase = 'Pi Testnet';

// 두 지갑의 키 쌍 준비
const issuerKeys = StellarSdk.Keypair.fromSecret(ISSUER_SECRET_KEY);
const distributorKeys = StellarSdk.Keypair.fromSecret(DISTRIBUTOR_SECRET_KEY);

// 발행할 토큰 정의
const spotToken = new StellarSdk.Asset(TOKEN_CODE, issuerKeys.publicKey());

/**
 * 디버깅: 계정 정보 확인
 */
async function checkAccount(publicKey, accountName) {
  try {
    console.log(`\n[디버깅] ${accountName} 계정 확인 중...`);
    console.log(`  공개키: ${publicKey}`);

    const account = await server.loadAccount(publicKey);
    console.log(`  ✅ 계정 존재 확인됨`);
    console.log(`  시퀀스 번호: ${account.sequenceNumber()}`);

    // 잔액 확인
    const balances = account.balances || [];
    console.log(`  잔액 정보:`);
    balances.forEach((balance) => {
      if (balance.asset_type === 'native') {
        console.log(`    - Test-Pi: ${balance.balance}`);
      } else {
        console.log(
          `    - ${balance.asset_code}: ${
            balance.balance
          } (발행자: ${balance.asset_issuer?.substring(0, 8)}...)`
        );
      }
    });

    // 최소 잔액 확인 (수수료용)
    const nativeBalance = balances.find((b) => b.asset_type === 'native');
    if (nativeBalance && parseFloat(nativeBalance.balance) < 1) {
      console.log(
        `  ⚠️  경고: Test-Pi 잔액이 부족할 수 있습니다 (현재: ${nativeBalance.balance})`
      );
    }

    return account;
  } catch (error) {
    console.error(`\n[디버깅] 계정 로드 중 에러 발생:`);
    console.error(`  에러 타입: ${error.constructor.name}`);
    console.error(`  에러 메시지: ${error.message}`);

    if (error.response) {
      console.error(`  HTTP 상태: ${error.response.status}`);
      console.error(
        `  응답 URL: ${
          error.response.config?.url ||
          error.response.request?.responseURL ||
          'N/A'
        }`
      );
      if (error.response.data) {
        console.error(
          `  응답 데이터: ${JSON.stringify(error.response.data, null, 2)}`
        );
      }
    }

    if (error.response?.status === 404) {
      console.error(
        `  ❌ 계정이 존재하지 않습니다. Pi Wallet에서 계정을 활성화했는지 확인하세요.`
      );
      console.error(
        `  직접 확인: https://api.testnet.minepi.com/accounts/${publicKey}`
      );
    } else {
      console.error(`  ❌ 계정 로드 실패`);
    }
    throw error;
  }
}

/**
 * 절차 1: '금고'가 '공장'을 신뢰하도록 설정합니다.
 * (수행 주체: 유통 계정 / '금고')
 */
async function setupTrustline() {
  console.log('\n' + '='.repeat(60));
  console.log("--- 1단계: '금고' 신뢰선 설정 시작 ---");
  console.log('='.repeat(60));
  try {
    // 공식 문서 기준: 각 트랜잭션마다 계정을 재로드하여 최신 시퀀스 번호 사용
    console.log('\n[디버깅] 유통자 계정 로드 중...');
    const distributorAccount = await server.loadAccount(
      distributorKeys.publicKey()
    );
    console.log(
      `  ✅ 계정 로드 완료 (시퀀스: ${distributorAccount.sequenceNumber()})`
    );

    // 잔액 확인
    const balances = distributorAccount.balances || [];
    console.log(`  잔액 정보:`);
    balances.forEach((balance) => {
      if (balance.asset_type === 'native') {
        console.log(`    - Test-Pi: ${balance.balance}`);
      } else {
        console.log(`    - ${balance.asset_code}: ${balance.balance}`);
      }
    });

    // 최신 ledger에서 base fee 가져오기
    console.log('\n[디버깅] 네트워크 정보 확인 중...');
    const response = await server.ledgers().order('desc').limit(1).call();
    const latestBlock = response.records[0];
    const baseFee = latestBlock.base_fee_in_stroops;
    console.log(`  Base Fee: ${baseFee} stroops`);
    console.log(`  Ledger 번호: ${latestBlock.sequence}`);

    // Timebounds 가져오기
    console.log('\n[디버깅] Timebounds 설정 중...');
    const timebounds = await server.fetchTimebounds(90);
    console.log(
      `  유효 시간: ${new Date(
        timebounds.minTime * 1000
      ).toISOString()} ~ ${new Date(timebounds.maxTime * 1000).toISOString()}`
    );

    // 토큰 정보 확인
    console.log('\n[디버깅] 토큰 정보:');
    console.log(`  토큰 코드: ${TOKEN_CODE}`);
    console.log(`  발행자 공개키: ${issuerKeys.publicKey()}`);

    // 이미 신뢰선이 있는지 확인
    const existingTrustline = distributorAccount.balances.find(
      (b) =>
        b.asset_type !== 'native' &&
        b.asset_code === TOKEN_CODE &&
        b.asset_issuer === issuerKeys.publicKey()
    );
    if (existingTrustline) {
      console.log(`  ⚠️  이미 신뢰선이 존재합니다. 계속 진행합니다...`);
    }

    console.log('\n[디버깅] 트랜잭션 빌드 중...');
    const transaction = new StellarSdk.TransactionBuilder(distributorAccount, {
      fee: baseFee,
      networkPassphrase: networkPassphrase,
      timebounds: timebounds,
    })
      // '금고'가 토큰을 받겠다고 '신뢰(Trust)'함
      .addOperation(
        StellarSdk.Operation.changeTrust({
          asset: spotToken,
          limit: undefined, // 무제한 (문서 기준)
        })
      )
      .build();

    console.log(`  트랜잭션 해시: ${transaction.hash().toString('hex')}`);
    console.log(`  수수료: ${transaction.fee} stroops`);
    console.log(`  작업 수: ${transaction.operations.length}`);

    // '금고'의 비밀키로 서명
    console.log('\n[디버깅] 트랜잭션 서명 중...');
    transaction.sign(distributorKeys);
    console.log('  ✅ 서명 완료');

    console.log('\n[디버깅] 트랜잭션 전송 중...');
    const result = await server.submitTransaction(transaction);
    console.log('\n✅ 1단계 성공! 신뢰선 설정 완료');
    console.log(`  트랜잭션 링크: ${result._links.transaction.href}`);
    console.log(`  Ledger: ${result.ledger}`);
    console.log(`  해시: ${result.hash}`);
    return true;
  } catch (error) {
    console.error('\n❌ 1단계 실패:');
    console.error('='.repeat(60));

    if (error.response) {
      console.error('HTTP 상태 코드:', error.response.status);
      console.error(
        '응답 데이터:',
        JSON.stringify(error.response.data, null, 2)
      );

      if (error.response.data?.extras?.result_codes) {
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

      if (error.response.data?.extras?.result_xdr) {
        console.error('\nXDR 결과:', error.response.data.extras.result_xdr);
      }
    } else {
      console.error('에러 타입:', error.constructor.name);
      console.error('에러 메시지:', error.message);
      if (error.stack) {
        console.error('\n스택 트레이스:');
        console.error(error.stack);
      }
    }

    console.error('='.repeat(60));
    return false;
  }
}

/**
 * 절차 2: '공장'이 토큰을 발행하고, 즉시 스스로를 잠급니다.
 * (수행 주체: 발행 계정 / '공장')
 */
async function issueAndLock() {
  console.log('\n' + '='.repeat(60));
  console.log("--- 2단계: '공장' 발행 및 잠금 시작 ---");
  console.log('='.repeat(60));
  try {
    // 공식 문서 기준: 각 트랜잭션마다 계정을 재로드하여 최신 시퀀스 번호 사용
    // 공식 문서 예제처럼 매번 새로 서버 인스턴스를 사용하는 것이 안전함
    console.log('\n[디버깅] 발행자 계정 로드 중...');
    // 전역 server 객체 대신 새 인스턴스 사용 (공식 문서 예제 방식)
    const issuerServer = new StellarSdk.Horizon.Server(
      'https://api.testnet.minepi.com'
    );
    const issuerAccount = await issuerServer.loadAccount(
      issuerKeys.publicKey()
    );
    console.log(
      `  ✅ 계정 로드 완료 (시퀀스: ${issuerAccount.sequenceNumber()})`
    );

    // 잔액 확인
    const issuerBalances = issuerAccount.balances || [];
    console.log(`  잔액 정보:`);
    issuerBalances.forEach((balance) => {
      if (balance.asset_type === 'native') {
        console.log(`    - Test-Pi: ${balance.balance}`);
      }
    });

    // 최신 ledger에서 base fee 가져오기
    console.log('\n[디버깅] 네트워크 정보 확인 중...');
    const response = await issuerServer.ledgers().order('desc').limit(1).call();
    const latestBlock = response.records[0];
    const baseFee = latestBlock.base_fee_in_stroops;
    console.log(`  Base Fee: ${baseFee} stroops`);
    console.log(`  Ledger 번호: ${latestBlock.sequence}`);

    // Timebounds 가져오기
    console.log('\n[디버깅] Timebounds 설정 중...');
    const timebounds = await issuerServer.fetchTimebounds(90);
    console.log(
      `  유효 시간: ${new Date(
        timebounds.minTime * 1000
      ).toISOString()} ~ ${new Date(timebounds.maxTime * 1000).toISOString()}`
    );

    // 발행 정보 확인
    console.log('\n[디버깅] 발행 정보:');
    console.log(`  발행량: ${TOKEN_AMOUNT} ${TOKEN_CODE}`);
    console.log(`  수신자: ${distributorKeys.publicKey()} (금고)`);

    // 금고 계정이 신뢰선을 설정했는지 확인
    console.log('\n[디버깅] 금고 계정 신뢰선 확인 중...');
    const distributorAccount = await issuerServer.loadAccount(
      distributorKeys.publicKey()
    );
    const hasTrustline = distributorAccount.balances.some(
      (b) =>
        b.asset_type !== 'native' &&
        b.asset_code === TOKEN_CODE &&
        b.asset_issuer === issuerKeys.publicKey()
    );
    if (!hasTrustline) {
      throw new Error(
        '금고 계정에 신뢰선이 설정되지 않았습니다. 1단계를 먼저 완료하세요.'
      );
    }
    console.log('  ✅ 신뢰선 확인됨');

    console.log('\n[디버깅] 트랜잭션 빌드 중...');
    const transaction = new StellarSdk.TransactionBuilder(issuerAccount, {
      fee: baseFee,
      networkPassphrase: networkPassphrase,
      timebounds: timebounds,
    })
      // 1. 토큰을 '금고'로 발행(전송)
      .addOperation(
        StellarSdk.Operation.payment({
          destination: distributorKeys.publicKey(),
          asset: spotToken,
          amount: TOKEN_AMOUNT,
        })
      )
      // 2. '공장' 계정을 영구적으로 잠금 (추가 발행 절대 불가) 및 Home Domain 설정
      .addOperation(
        StellarSdk.Operation.setOptions({
          masterWeight: 0, // 마스터 가중치를 0으로 설정
          homeDomain: 'cafe-pi-prj.netlify.app', // [!!!필수 수정!!!] 2단계의 Netlify 주소 (https:// 제외)
        })
      )
      .build();

    console.log(`  트랜잭션 해시: ${transaction.hash().toString('hex')}`);
    console.log(`  수수료: ${transaction.fee} stroops`);
    console.log(`  작업 수: ${transaction.operations.length}`);
    console.log(`  작업 1: Payment (${TOKEN_AMOUNT} ${TOKEN_CODE})`);
    console.log(`  작업 2: SetOptions (masterWeight: 0, homeDomain: ...)`);

    // '공장'의 비밀키로 서명
    console.log('\n[디버깅] 트랜잭션 서명 중...');
    transaction.sign(issuerKeys);
    console.log('  ✅ 서명 완료');

    console.log('\n[디버깅] 트랜잭션 전송 중...');
    const result = await issuerServer.submitTransaction(transaction);
    console.log('\n🎉 2단계 성공! 발행 및 잠금 완료');
    console.log(`  트랜잭션 링크: ${result._links.transaction.href}`);
    console.log(`  Ledger: ${result.ledger}`);
    console.log(`  해시: ${result.hash}`);
    console.log(
      `\n'${distributorKeys.publicKey()}' (금고) 지갑에 ${TOKEN_AMOUNT} ${TOKEN_CODE}가 전송되었습니다.`
    );
    console.log(
      `'${issuerKeys.publicKey()}' (공장) 지갑은 영구적으로 잠겼습니다.`
    );
  } catch (error) {
    console.error('\n❌ 2단계 실패:');
    console.error('='.repeat(60));

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
      console.error(
        '응답 데이터:',
        JSON.stringify(error.response.data, null, 2)
      );

      if (error.response.data?.extras?.result_codes) {
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

      if (error.response.data?.extras?.result_xdr) {
        console.error('\nXDR 결과:', error.response.data.extras.result_xdr);
      }
    } else {
      console.error('에러 타입:', error.constructor.name);
      console.error('에러 메시지:', error.message);
      if (error.stack) {
        console.error('\n스택 트레이스:');
        console.error(error.stack);
      }
    }

    console.error('='.repeat(60));
    return false;
  }
}

/**
 * 초기 검증
 */
async function validateSetup() {
  console.log('='.repeat(60));
  console.log('초기 설정 검증 중...');
  console.log('='.repeat(60));

  // 키 쌍 검증
  console.log('\n[검증] 키 쌍 확인:');
  try {
    const issuerPublicFromSecret = issuerKeys.publicKey();
    const distributorPublicFromSecret = distributorKeys.publicKey();

    console.log(
      `  발행자 공개키 일치: ${
        issuerPublicFromSecret === ISSUER_PUBLIC_KEY ? '✅' : '❌'
      }`
    );
    console.log(
      `  유통자 공개키 일치: ${
        distributorPublicFromSecret === DISTRIBUTOR_PUBLIC_KEY ? '✅' : '❌'
      }`
    );

    if (
      issuerPublicFromSecret !== ISSUER_PUBLIC_KEY ||
      distributorPublicFromSecret !== DISTRIBUTOR_PUBLIC_KEY
    ) {
      throw new Error('공개키가 비밀키와 일치하지 않습니다!');
    }
  } catch (error) {
    console.error('  ❌ 키 쌍 검증 실패:', error.message);
    throw error;
  }

  // 네트워크 연결 확인
  console.log('\n[검증] 네트워크 연결 확인:');
  try {
    const serverInfo = await server.fetchTimebounds(90);
    console.log('  ✅ Pi Testnet 연결 성공');
  } catch (error) {
    console.error('  ❌ 네트워크 연결 실패:', error.message);
    throw error;
  }

  // 토큰 코드 검증
  console.log('\n[검증] 토큰 설정:');
  console.log(`  토큰 코드: ${TOKEN_CODE}`);
  if (TOKEN_CODE.length > 12) {
    throw new Error('토큰 코드는 12자 이하여야 합니다!');
  }
  if (!/^[A-Z0-9]+$/.test(TOKEN_CODE)) {
    throw new Error('토큰 코드는 영숫자만 가능합니다!');
  }
  console.log('  ✅ 토큰 코드 유효');

  console.log('\n' + '='.repeat(60));
  console.log('초기 검증 완료!');
  console.log('='.repeat(60));
}

/**
 * 스크립트 실행
 */
async function run() {
  try {
    await validateSetup();

    const trustlineSuccess = await setupTrustline();

    if (trustlineSuccess) {
      // 1단계(신뢰선)가 성공해야만 2단계를 실행합니다.
      await issueAndLock();

      console.log('\n' + '='.repeat(60));
      console.log('✅ 모든 작업이 완료되었습니다!');
      console.log('='.repeat(60));
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('1단계 신뢰선 설정에 실패하여 2단계를 진행하지 않습니다.');
      console.log('='.repeat(60));
    }
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ 치명적 오류 발생:');
    console.error(error.message);
    if (error.stack) {
      console.error('\n스택 트레이스:');
      console.error(error.stack);
    }
    console.error('='.repeat(60));
    process.exit(1);
  }
}

run();
