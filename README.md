# KTM 250 — THE RIDE

Projeto de montagem local de 60 segundos em UHD (3840 × 2160, 30 fps), com HyperFrames 0.9.65, TypeScript, Node.js e FFmpeg. A lista em cuts.json contém os nove nomes DJI e uma grelha de montagem provisória. Revê os pontos de entrada e o enquadramento com os originais.

## Preparação no Windows

Instala Node.js 22.18 ou superior e uma compilação do FFmpeg com libx264. Confirma que ffmpeg e ffprobe estão no PATH. A partir da raiz do repositório, em PowerShell:

~~~powershell
node --version
ffmpeg -version
ffprobe -version
npm install
npx hyperframes --version
npx hyperframes browser ensure
~~~

1. Confirma o caminho videos em cuts.json. Os caminhos relativos são resolvidos a partir da pasta do JSON.
2. Coloca uma faixa musical que possas utilizar em local/music.wav. A configuração inicial precisa de 60 s de música a partir de music.in.
3. Coloca em local/engine.wav uma gravação real da mota. Também podes indicar um MP4 ou outro ficheiro com áudio captado durante a filmagem. O pré-processamento verifica se existe uma faixa de áudio. A configuração inicial prevê seis segundos desde a abertura. Ajusta a posição e os pontos de entrada para coincidir com a ação.
4. Revê os nove planos e edita cuts.json.

## Cortes, ritmo e correção de cor

- **file**, **in** e **at** selecionam o ficheiro, o ponto de entrada no original e a posição desejada na montagem, em segundos.
- **music.beats** recebe os tempos dos acentos na faixa original, em segundos. Marca-os por audição ou usa npx hyperframes beats local/music.wav --json para detetar candidatos. O script subtrai music.in e desloca cada início até oito fotogramas para a batida mais próxima. Com a lista vazia, os cortes seguem at. Confirma cada acento na pré-visualização.
- **dissolveFrames** é a duração em fotogramas da transição de entrada. O plano anterior continua por esse intervalo. Usa 0 para um corte direto.
- **speed** contém as velocidades inicial e final. [1, 1] preserva o ritmo original. [1, 1.5] acelera progressivamente. Só habilita câmara lenta depois de verificar os FPS reais e o movimento. O script recusa combinações em que FPS de origem × velocidade mínima fica abaixo de 30 fps.
- **grade** ajusta contraste, saturação e gama por plano. O ponto de partida é um ajuste suave. Para perfis log ou HDR, faz primeiro a conversão técnica adequada para SDR Rec.709 e aponta a configuração para esses intermediários. Revê a exposição, o equilíbrio entre planos e o recorte 16:9 na pré-visualização.
- **engine** permite colocar mais excertos de som real. Cada entrada define ficheiro, in, at, duration e volume. O FFmpeg mistura a faixa musical e o motor com fades e limitador.

## Pré-visualização e exportação

~~~powershell
npm run prepareFilm -- cuts.json work/preview --preview
npx hyperframes preview work/preview
~~~

A pré-visualização usa 960 × 540. O HTML é gerado a partir de composition.html. Guarda edições permanentes em cuts.json ou no ficheiro fonte composition.html, porque uma nova preparação regenera o projeto em work/.

~~~powershell
npm run prepareFilm -- cuts.json work/film
npx hyperframes check work/film --json
npx hyperframes render work/film --fps 30 --quality delivery -o work/KTM-250-THE-RIDE.mp4
ffprobe -v error -show_entries stream=codec_name,codec_type,width,height,avg_frame_rate:format=duration -of json work/KTM-250-THE-RIDE.mp4
~~~

Confirma 3840 × 2160, 30 fps, uma faixa de áudio e uma duração de cerca de 60 s. Os ficheiros em local/ e work/ são privados da cópia de trabalho e estão excluídos do Git.

## Testes sem as gravações

~~~powershell
npm run typecheck
npm test
npm run smoke
npx hyperframes lint work/smoke-film
npx hyperframes check work/smoke-film --json
npx hyperframes render work/smoke-film --fps 30 --quality draft -o work/smoke.mp4
~~~

O teste de integração gera três segundos com padrões de imagem e tons de teste em work/. Exercita a preparação com uma rampa, uma transição e duas fontes de áudio. Usa o filme real para avaliar cor, ritmo e sincronismo do motor.

[Skills oficiais do HyperFrames 0.9.65](https://github.com/heygen-com/hyperframes/tree/v0.9.65/skills) · [Filtros do FFmpeg](https://ffmpeg.org/ffmpeg-filters.html)
