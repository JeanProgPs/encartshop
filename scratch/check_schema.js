
async function testSchema() {
  const { data, error } = await window.sb.from('stores').select('*').limit(1);
  if (error) {
    console.error('Schema error:', error);
  } else if (data && data.length > 0) {
    console.log('Columns in stores:', Object.keys(data[0]));
  } else {
    console.log('No data in stores table to infer schema.');
    // Try to insert a dummy to see what fails? No, better check if we can get column info.
    // In PostgREST/Supabase, we can't easily get the full schema without a specialized query.
  }
}
testSchema();
