package com.dovebevo.app;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Small bounded JSON reader: unlike JSONTokener, no comments, coercions or duplicate object keys. */
final class NativeJson {
    static Object read(byte[] bytes, int maximum) throws IOException {
        if(bytes==null||bytes.length==0||bytes.length>maximum)throw invalid();
        try {
            String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
            return new Parser(text).read();
        } catch(IllegalArgumentException error) { throw invalid(); }
    }
    static long integer(Object value,long min,long max) throws IOException {
        if(!(value instanceof Number)||!((Number)value).token.matches("-?(0|[1-9][0-9]*)"))throw invalid();
        try { long number=Long.parseLong(((Number)value).token);if(number<min||number>max)throw invalid();return number; }
        catch(NumberFormatException error){throw invalid();}
    }
    static double decimal(Object value,double min,double max) throws IOException {
        if(!(value instanceof Number))throw invalid();
        double number=((Number)value).value.doubleValue();
        if(!Double.isFinite(number)||number<min||number>max)throw invalid();return number;
    }
    static IOException invalid(){return new IOException("Public data is unavailable");}
    private static final class Number {
        final String token; final BigDecimal value;
        Number(String token){this.token=token;value=new BigDecimal(token);}
    }
    private static final class Parser {
        final String text;int offset;
        Parser(String text){this.text=text;}
        Object read()throws IOException{Object result=value(0);space();if(offset!=text.length())throw invalid();return result;}
        void space(){while(offset<text.length()&&" \t\r\n".indexOf(text.charAt(offset))>=0)offset++;}
        boolean take(char c){space();if(offset<text.length()&&text.charAt(offset)==c){offset++;return true;}return false;}
        void require(char c)throws IOException{if(!take(c))throw invalid();}
        Object value(int depth)throws IOException{
            if(depth>6)throw invalid();space();if(offset==text.length())throw invalid();
            if(text.charAt(offset)=='"')return string();
            if(take('{')){
                Map<String,Object> result=new HashMap<>();if(take('}'))return result;
                do{String key=string();require(':');if(result.containsKey(key)||result.size()>=32)throw invalid();result.put(key,value(depth+1));}while(take(','));
                require('}');return result;
            }
            if(take('[')){
                List<Object> result=new ArrayList<>();if(take(']'))return result;
                do{if(result.size()>=50000)throw invalid();result.add(value(depth+1));}while(take(','));require(']');return result;
            }
            for(String literal:new String[]{"true","false","null"})if(text.startsWith(literal,offset)){
                offset+=literal.length();return literal.equals("null")?null:Boolean.valueOf(literal);
            }
            int begin=offset;while(offset<text.length()&&"0123456789eE+-.".indexOf(text.charAt(offset))>=0)offset++;
            String token=text.substring(begin,offset);
            if(token.length()>64||!token.matches("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?"))throw invalid();
            try{return new Number(token);}catch(NumberFormatException error){throw invalid();}
        }
        String string()throws IOException{
            require('"');StringBuilder result=new StringBuilder();
            while(offset<text.length()){
                char c=text.charAt(offset++);
                if(c=='"'){
                    for(int i=0;i<result.length();i++){
                        char unit=result.charAt(i);
                        if(Character.isHighSurrogate(unit)){if(++i==result.length()||!Character.isLowSurrogate(result.charAt(i)))throw invalid();}
                        else if(Character.isLowSurrogate(unit))throw invalid();
                    }return result.toString();
                }
                if(c<32)throw invalid();
                if(c=='\\'){
                    if(offset==text.length())throw invalid();c=text.charAt(offset++);
                    switch(c){
                        case '"':case '\\':case '/':break;
                        case 'b':c='\b';break;case 'f':c='\f';break;case 'n':c='\n';break;case 'r':c='\r';break;case 't':c='\t';break;
                        case 'u':int code=0;for(int i=0;i<4;i++){if(offset==text.length())throw invalid();int digit="0123456789abcdef".indexOf(Character.toLowerCase(text.charAt(offset++)));if(digit<0)throw invalid();code=code*16+digit;}c=(char)code;break;
                        default:throw invalid();
                    }
                }result.append(c);
            }throw invalid();
        }
    }
}
