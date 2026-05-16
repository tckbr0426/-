// 리듬 데이터 정의 (종류, 총 박자수, 소리가 나는 상대적 타이밍 배열)
const RHYTHM_DATA = {
    quarter: { name: '4분음표', duration: 1.0, hits: [0], icon: '♩' },
    quarter_rest: { name: '4분쉼표', duration: 1.0, hits: [], icon: '𝄽' },
    two_eighths: { name: '8분음표 2개', duration: 1.0, hits: [0, 0.5], icon: '♫' },
    eighth_rest: { name: '8분쉼표 1개', duration: 0.5, hits: [], icon: '𝄾' },
    four_sixteenths: { name: '16분음표 4개', duration: 1.0, hits: [0, 0.25, 0.5, 0.75], icon: '♬' }
};

let userComposition = []; // 학생들이 담은 리듬 순서 배열
let audioCtx = null;      // 오디오 콘텍스트 변수
let isPlaying = false;    // 재생 상태 플래그
let playbackTimeouts = []; // 시각 효과용 타이머 보관함

// DOM 요소 탐색
const workspace = document.getElementById('workspace');
const totalBeatsSpan = document.getElementById('totalBeats');
const bpmSlider = document.getElementById('bpmSlider');
const bpmValue = document.getElementById('bpmValue');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const metroCheck = document.getElementById('metroCheck');

// 템포 슬라이더 변경 감지
bpmSlider.addEventListener('input', (e) => {
    bpmValue.textContent = e.target.value;
});

// 리듬 카드 선택(추가) 이벤트 리스너 설정
document.querySelectorAll('.rhythm-card.source').forEach(card => {
    card.addEventListener('click', () => {
        if (isPlaying) return; // 재생 중엔 추가 금지
        const type = card.getAttribute('data-type');
        addNoteToWorkspace(type);
    });
});

// 워크스페이스에 리듬 카드 추가 기능
function addNoteToWorkspace(type) {
    // 플레이스홀더(안내 문구) 삭제
    const placeholder = workspace.querySelector('.placeholder-text');
    if (placeholder) placeholder.remove();

    userComposition.push(type);
    renderWorkspace();
}

// 워크스페이스 그리기 및 총 박자 계산
function renderWorkspace() {
    workspace.innerHTML = '';
    
    if (userComposition.length === 0) {
        workspace.innerHTML = '<p class="placeholder-text">여기에 리듬 카드를 채워 곡을 완성해 보세요!</p>';
        totalBeatsSpan.textContent = '(총 0박자)';
        return;
    }

    let totalBeats = 0;
    userComposition.forEach((type, index) => {
        const data = RHYTHM_DATA[type];
        totalBeats += data.duration;

        const card = document.createElement('div');
        card.className = 'rhythm-card';
        card.setAttribute('data-index', index);
        card.innerHTML = `
            <div class="note-icon">${data.icon}</div>
            <div class="note-name">${data.name}</div>
            <div class="note-duration">${data.duration}박자</div>
        `;
        
        // 클릭 시 해당 카드 삭제 기능 연결
        card.addEventListener('click', () => {
            if (isPlaying) return;
            userComposition.splice(index, 1);
            renderWorkspace();
        });

        workspace.appendChild(card);
    });

    totalBeatsSpan.textContent = `(총 ${totalBeats}박자)`;
}

// 처음부터 다시 만들기(비우기)
clearBtn.addEventListener('click', () => {
    if (isPlaying) stopRhythm();
    userComposition = [];
    renderWorkspace();
});

// 정지 버튼 클릭
stopBtn.addEventListener('click', stopRhythm);

// 재생 버튼 클릭
playBtn.addEventListener('click', () => {
    if (userComposition.length === 0) {
        alert('먼저 리듬 카드를 추가해 주세요!');
        return;
    }
    
    // 브라우저 정책 오디오 활성화 제어
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    startPlayback();
});

// 타악기 소리 합성용 함수 (우드블록 스타일)
function playSound(time, isMetronome = false) {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (isMetronome) {
        // 메트로놈 가이드 소리: 조금 더 낮고 부드러운 소리
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(350, time);
        gainNode.gain.setValueAtTime(0.15, time); // 소리 크기 작게 조절
    } else {
        // 실제 학생들이 만든 리듬 소리: 또렷하고 청명한 소리
        osc.type = 'sine';
        osc.frequency.setValueAtTime(850, time);
        osc.frequency.exponentialRampToValueAtTime(300, time + 0.05);
        gainNode.gain.setValueAtTime(0.6, time);
    }
    
    // 소리 잔향 감쇄(Envelope) 효과 적용
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    
    osc.start(time);
    osc.stop(time + 0.07);
}

// 실제 리듬 연주 처리 프로세스
function startPlayback() {
    isPlaying = true;
    playBtn.disabled = true;
    stopBtn.disabled = false;
    
    const bpm = parseInt(bpmSlider.value);
    const beatDuration = 60 / bpm; // 1박자당 소요 시간(초)
    
    let currentBeatOffset = 0;
    const startTime = audioCtx.currentTime + 0.1; // 재생 안정성을 위한 약간의 딜레이
    
    userComposition.forEach((type, index) => {
        const data = RHYTHM_DATA[type];
        const cardDOM = workspace.children[index];
        const cardStartSeconds = currentBeatOffset * beatDuration;
        
        // 1. 시각적 하이라이트 효과 타이머 예약 설정
        const timeoutId = setTimeout(() => {
            // 이전 하이라이팅 지우기
            document.querySelectorAll('.workspace .rhythm-card').forEach(c => c.classList.remove('playing'));
            if (cardDOM) cardDOM.classList.add('playing');
        }, cardStartSeconds * 1000);
        
        playbackTimeouts.push(timeoutId);
        
        // 2. 오디오 노드 예약 (학생 리듬 소리)
        data.hits.forEach(hitOffset => {
            const hitTime = startTime + (currentBeatOffset + hitOffset) * beatDuration;
            playSound(hitTime, false);
        });
        
        // 3. 오디오 노드 예약 (메트로놈 가이드 체크 시)
        if (metroCheck.checked) {
            // 음표의 메인 정박 타이밍에만 가이드 비트 재생
            if (data.duration >= 1.0) {
                playSound(startTime + cardStartSeconds, true);
            } else if (data.duration === 0.5 && currentBeatOffset % 1.0 === 0) {
                // 0.5박자 음표가 정박 자리에 떨어질 때만 연주
                playSound(startTime + cardStartSeconds, true);
            }
        }
        
        currentBeatOffset += data.duration;
    });
    
    // 전체 리듬 연주가 종료되었을 때 상태 원상복구용 타이머 예약
    const totalDurationSeconds = currentBeatOffset * beatDuration;
    const endTimeout = setTimeout(() => {
        stopRhythm();
    }, totalDurationSeconds * 1000 + 100);
    
    playbackTimeouts.push(endTimeout);
}

// 리듬 연주 중단 및 청소 기능
function stopRhythm() {
    isPlaying = false;
    playBtn.disabled = false;
    stopBtn.disabled = true;
    
    // 대기 중인 모든 시각 효과 타이머 폐기
    playbackTimeouts.forEach(id => clearTimeout(id));
    playbackTimeouts = [];
    
    // 배치판 내의 모든 하이라이트 스타일 제거
    document.querySelectorAll('.workspace .rhythm-card').forEach(c => c.classList.remove('playing'));
}
