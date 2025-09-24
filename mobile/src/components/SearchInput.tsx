import { useState } from 'react';
import { View, TextInput, Pressable, Text } from 'react-native';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import React from 'react';

export default function SearchInput({ onChange }: { onChange: (q:string)=>void }) {
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 400);

  // dispara onChange cuando cambie el valor debounced
  React.useEffect(()=>{ onChange(debounced); }, [debounced]);

  return (
    <View style={{ flexDirection:'row', gap:8, alignItems:'center', padding:8 }}>
      <TextInput
        placeholder="Buscar por nombre o SKU…"
        value={q}
        onChangeText={setQ}
        style={{ flex:1, padding:10, borderWidth:1, borderColor:'#ccc', borderRadius:8 }}
      />
      {!!q && (
        <Pressable onPress={()=>setQ('')}>
          <Text style={{ padding:8 }}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}
