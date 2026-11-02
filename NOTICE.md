# 출처

코드를 그대로 복사하지는 않았지만, 아래 저작물의 공식과 설계를 참고해 TypeScript로 다시 썼습니다.

## MIT 라이선스 프로젝트

- **florilegium**, Copyright (c) 2026 Kevin Raymond, MIT. https://github.com/kevinraymond/florilegium
  참고: 모티프 표(크기, 가중치, 상한), 큰 구멍 우선 그리디 루프, 잉크 하나에서 톤 램프를 만드는 방식, 수채 레이어 순서.
- **tikz-flora**, Copyright (c) 2026 the tikz-flora authors, MIT. https://github.com/wn-mitch/tikz-flora
  참고: 꽃잎 윤곽 공식 `W * sin(pi * t^k)^e * smoothstep(0, claw, t)^0.7`과 윤곽별 계수, wedge 윤곽, 단계별 스타일 설정.

두 프로젝트의 라이선스 전문은 각 저장소의 `LICENSE`에 있습니다. 배포할 때는 두 저작권 고지와 MIT 허가 문구를 함께 포함해야 합니다.

## 공개 알고리즘

- mulberry32, Tommy Ettinger. 퍼블릭 도메인.
- Oklab, Bjorn Ottosson (2020). 변환 행렬은 퍼블릭 도메인.
- 거리 변환, Felzenszwalb & Huttenlocher.
- 논문 목록은 [docs/RESEARCH.md](docs/RESEARCH.md)를 보세요.
