# 연구 정리

기준 논문은 Wong, Zongker, Salesin, *Computer-Generated Floral Ornament* (SIGGRAPH 1998)입니다.

## 확인 범위

- 논문 전문은 직접 읽었습니다.
- florilegium과 tikz-flora는 README와 핵심 소스를 읽었습니다.
- flora.alpacasoft.dev는 tikz-flora의 사이트입니다. 페이지 본문은 자바스크립트로 그려져서 내용을 읽지 못했고, 저장소로 대신 확인했습니다.
- Reddit 글 두 개는 자동 수집이 막혀 읽지 못했습니다. 기법은 두 저장소로 확인했습니다.

## 세 자료의 공통점

| 공통 원리 | Wong 1998 | florilegium | tikz-flora | flora |
|---|---|---|---|---|
| 구조와 렌더링 분리 | 기하 후 스켈레탈 스트로크 | 지오메트리를 Lua로, PDF로 출력 | PGF로 출력 | `Part`와 `Material` |
| 단순한 프록시로 충돌 판정 | 원, 선, 베지어 | 디스크 | 디스크 | 디스크, 선 |
| 가장 큰 빈 원을 먼저 | MAT + 원 부풀리기 | 격자의 자유 반경 | 같은 방식 | 정확한 거리 변환 |
| 줄기 근처에서만 성장 | 거리 ε 이내 | `REACH` | 같은 방식 | `reachLimit` |
| 접선으로 합류, 모티프 축으로 도착 | 의도(intention) | 분기 곡선 | 같은 방식 | `branchTo` |
| 큰 것에서 작은 것으로 | 상태 전제조건 | 단계 + 필러 | 같은 방식 | 5단계 |
| 시드 결정론 | 언급 없음 | mulberry32 | 포크 스트림 | 라벨 포크 |

## 각 자료에서 가져온 장점

- **Wong 1998**: 적응형 클립아트, 제외 목록, 공간 분류(띠, 반개방 경계, 패널, 열린 평면), 벽 폭에 맞춘 사행 주기, 등각 나선 덩굴손, 렌더 스타일 분리.
- **florilegium**: 모티프 표, 성장 재생 애니메이션, 잉크 하나에서 만드는 톤 램프.
- **tikz-flora**: 꽃잎 윤곽 공식, 3D 투영 꽃, 스트림을 라벨로 분리해 색만 바꿔도 형태가 유지되는 방식, 본문 틈새 채우기.

## 이 라이브러리가 더한 것

- 3D 꽃잎 하나로 모든 꽃을 표현하는 통합 모델. 레퍼런스는 꽃 종류별로 그리기 함수가 따로 있습니다.
- 11가지 재질. 레퍼런스는 수채화 중심입니다.
- 임의 영역, 띠와 타일의 이음매 없는 반복, 대칭. 논문이 다음 과제로 남긴 항목입니다.
- `exclude` 상자를 넘는 요소는 배치 전에 거부합니다. 테스트로 검증합니다.
- `identity`와 엠블럼. 파일과 폴더에 고유한 꽃을 줍니다.

논문이 한계로 든 전역 계획 부족은 부분적으로만 해결했습니다. 주 줄기는 영역 뼈대를 따라가지만, 멀리 있는 줄기가 곡선으로 빈 공간을 지나가게 하지는 못합니다.

## 관련 논문

표시: **A** 원문 확인, **B** 출판사나 저자 페이지에서 서지 확인(방법은 초록 수준), **C** 2차 출처만 확인.

| 분류 | 논문 | 근거 | 활용 | 상태 |
|---|---|---|---|---|
| 성장 | Xu & Mould, *Magnetic Curves* (CAe 2009) | A | 자기장 입자 궤적으로 장식적 나선 줄기 | 후보 1순위 |
| 성장 | Runions et al., *Modeling and visualization of leaf venation patterns* (SIGGRAPH 2005) | A | 옥신 기반 잎맥 생성 | 후보 |
| 성장 | Runions et al., *Modeling Trees with a Space Colonization Algorithm* (2007) | A | 2D 덩굴 성장 | 후보 |
| 성장 | Bridson, *Fast Poisson disk sampling* (2007) | A | 시드, 흩뿌림 | 후보 |
| 배치 | Saputra et al., *FLOWPAK* (GI 2017) | A | 유선을 따라 요소 배치. 아래 특허 주의 | 보류 |
| 배치 | Saputra et al., *RepulsionPak* (GI 2018) | A | 반발력 패킹 | 보류, 비용 큼 |
| 배치 | Jobard & Lefer, *Evenly-Spaced Streamlines* (1997) | B | 줄기, 해칭 배치 | 후보 |
| 배치 | Anderson, *2D Ornamentation Using a User-Driven Global Planning Strategy* (석사논문, 2007) | A(일부) | 사용자 곡선으로 전역 계획. 위 한계의 직접 후속 | 후보 |
| 배치 | Hamekasi & Samavati, *Persian Floral Patterns Using Circle Packing* (GRAPP 2012) | B | 원 배치로 구조 저장 | 참고 |
| 형태 | Vogel, *A better way to construct the sunflower head* (1979) | C | 씨앗 배치 | **적용** |
| 형태 | Ijiri et al., *Floral diagrams and inflorescences* (SIGGRAPH 2005) | B | 구조와 형상 분리 | **적용** (윤생 데이터) |
| 형태 | Gielis, superformula (2003) | C | 함수 하나로 윤곽 다양화 | 후보 |
| 형태 | Prusinkiewicz & Lindenmayer, *Algorithmic Beauty of Plants* (1990) | B | 요소 내부 구조 참고. 논문은 주 루프에서 L-시스템을 쓰지 않았습니다 | 참고 |
| 재질 | Curtis et al., *Computer-Generated Watercolor* (SIGGRAPH 1997) | A | Kubelka-Munk 합성만 채용 가능 | 레이어 구조만 적용 |
| 재질 | Hobbs, 수채 시뮬레이션 글 (2017, 비학술) | A | 다각형 변위 레이어 | **적용** (`deform`) |
| 재질 | Mould, *A Stained Glass Image Filter* (2003) | A | 납선과 색 선택 | 참고 |
| 재질 | Winkenbach & Salesin, *Rendering Parametric Surfaces in Pen and Ink* (SIGGRAPH 1996) | B | 해칭 밀도 제어 | 참고 |
| 재질 | Ostromoukhov, *Digital Facial Engraving* (SIGGRAPH 1999) | B | 판화 레이어 | 참고 |
| 재질 | Sochorová & Jamriška, *Practical Pigment Mixing* (TOG 2021) | B | Mixbox는 비상업 라이선스로 보고되어 제외 | 제외 |

## 주의

- **특허**: 검색 결과에 FLOWPAK 파이프라인과 초록이 비슷한 US 10559061과 US 10403015(*Interactive generation of procedural ornaments*)가 나왔습니다. 상태와 청구항은 확인하지 않았습니다. FLOWPAK식 기능을 넣기 전에 검토가 필요합니다.
- 서지 일부는 출처끼리 다릅니다. Vogel 쪽수, Mould 학회 표기 등은 인용 전에 원문을 확인하세요.
- 조사 중 확인되지 않은 후보(예: *Pictures with Polygons*)는 표에서 뺐습니다.
