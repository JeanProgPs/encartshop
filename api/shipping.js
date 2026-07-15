export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { origin, dest, weight = 1 } = req.query;

  if (!origin || !dest) {
    return res.status(400).json({ error: 'CEP de origem e destino são obrigatórios' });
  }

  try {
    // 04510 = PAC, 04014 = SEDEX
    // Dimensões padrão: 20x20x20cm
    const getUrl = (servico) => `http://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx?nCdEmpresa=&sDsSenha=&sCepOrigem=${origin}&sCepDestino=${dest}&nVlPeso=${weight}&nCdFormato=1&nVlComprimento=20&nVlAltura=20&nVlLargura=20&sCdMaoPropria=n&nVlValorDeclarado=0&sCdAvisoRecebimento=n&nCdServico=${servico}&nVlDiametro=0&StrRetorno=xml&nIndicaCalculo=3`;

    const pacUrl = getUrl('04510');
    const sedexUrl = getUrl('04014');

    const [pacRes, sedexRes] = await Promise.all([
      fetch(pacUrl).then(r => r.text()),
      fetch(sedexUrl).then(r => r.text())
    ]);

    const extractData = (xml) => {
      const valorMatch = xml.match(/<Valor>(.*?)<\/Valor>/);
      const prazoMatch = xml.match(/<PrazoEntrega>(.*?)<\/PrazoEntrega>/);
      const erroMatch = xml.match(/<MsgErro><!\[CDATA\[(.*?)\]\]><\/MsgErro>/) || xml.match(/<MsgErro>(.*?)<\/MsgErro>/);
      
      const valorStr = valorMatch ? valorMatch[1] : '0,00';
      const valor = parseFloat(valorStr.replace(',', '.'));
      const prazo = prazoMatch ? parseInt(prazoMatch[1], 10) : 0;
      const erro = erroMatch && erroMatch[1].trim() !== '' ? erroMatch[1] : null;

      return { valor, prazo, erro };
    };

    const pacData = extractData(pacRes);
    const sedexData = extractData(sedexRes);

    if ((pacData.erro && pacData.valor === 0) && (sedexData.erro && sedexData.valor === 0)) {
      return res.status(400).json({ error: 'CEP inválido ou área não atendida', detalhes: pacData.erro || sedexData.erro });
    }

    const options = [];
    if (pacData.valor > 0) {
      options.push({ type: 'PAC', price: pacData.valor, days: pacData.prazo, error: pacData.erro });
    }
    if (sedexData.valor > 0) {
      options.push({ type: 'SEDEX', price: sedexData.valor, days: sedexData.prazo, error: sedexData.erro });
    }

    return res.status(200).json({
      origin,
      dest,
      options
    });
  } catch (error) {
    console.error('Erro na API de frete:', error);
    return res.status(500).json({ error: 'Falha ao comunicar com os Correios' });
  }
}
