package com.dovebevo.app;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

/** An authoritative full snapshot, never an optimistic count or an unavailable-as-zero response. */
final class DrinkRecommendations {
    static final int MAX_BYTES = 32768;
    static final long MAX_COUNT = 9007199254740991L;
    final String venueKey;
    final List<Row> rows;
    static final class Row {
        final RecommendationDrink drink;
        final long count;
        final boolean recommended;
        Row(RecommendationDrink drink, long count, boolean recommended) {
            this.drink = drink; this.count = count; this.recommended = recommended;
        }
    }
    private DrinkRecommendations(String venueKey, List<Row> rows) {
        this.venueKey = venueKey; this.rows = Collections.unmodifiableList(rows);
    }
    Row row(RecommendationDrink drink) {
        for (Row row : rows) if (row.drink == drink) return row;
        throw new IllegalArgumentException("Unknown drink");
    }
    List<Row> sortedRows() {
        List<Row> sorted = new ArrayList<>(rows);
        Collections.sort(sorted, (a, b) -> {
            int count = Long.compare(b.count, a.count);
            return count == 0 ? Integer.compare(a.drink.ordinal(), b.drink.ordinal()) : count;
        });
        return sorted;
    }
    static DrinkRecommendations parse(byte[] bytes, String expectedVenue) throws IOException {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) throw invalid();
        try {
            String text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
            Object value = new Json(text).read();
            if (!(value instanceof Map)) throw invalid();
            Map<?, ?> object = (Map<?, ?>) value;
            if (!keys(object, "venue_key", "drinks") || !expectedVenue.equals(object.get("venue_key"))
                    || !(object.get("drinks") instanceof List)) throw invalid();
            List<?> drinks = (List<?>) object.get("drinks");
            if (drinks.size() != RecommendationDrink.values().length) throw invalid();
            List<Row> rows = new ArrayList<>();
            HashSet<RecommendationDrink> seen = new HashSet<>();
            for (Object item : drinks) {
                if (!(item instanceof Map)) throw invalid();
                Map<?, ?> row = (Map<?, ?>) item;
                if (!keys(row, "drink", "count", "recommended") || !(row.get("drink") instanceof String)
                        || !(row.get("count") instanceof BigDecimal) || !(row.get("recommended") instanceof Boolean)) throw invalid();
                RecommendationDrink drink = RecommendationDrink.from((String) row.get("drink"));
                long count = ((BigDecimal) row.get("count")).longValueExact();
                if (drink == null || !seen.add(drink) || count < 0 || count > MAX_COUNT) throw invalid();
                rows.add(new Row(drink, count, (Boolean) row.get("recommended")));
            }
            return new DrinkRecommendations(expectedVenue, rows);
        } catch (CharacterCodingException | IllegalArgumentException | ArithmeticException error) { throw invalid(); }
    }
    private static boolean keys(Map<?, ?> value, String... names) {
        return value.keySet().equals(new HashSet<>(Arrays.asList(names)));
    }
    private static IOException invalid() { return new IOException("Recommendation response is unavailable"); }

    /** Android's JSONTokener accepts comments/unquoted keys; this small bounded parser accepts JSON only. */
    private static final class Json {
        private final String text; private int offset;
        Json(String text) { this.text = text; }
        Object read() throws IOException { Object value = value(0); space(); if (offset != text.length()) throw invalid(); return value; }
        void space() { while (offset < text.length() && " \t\r\n".indexOf(text.charAt(offset)) >= 0) offset++; }
        boolean take(char c) { space(); if (offset < text.length() && text.charAt(offset) == c) { offset++; return true; } return false; }
        void require(char c) throws IOException { if (!take(c)) throw invalid(); }
        Object value(int depth) throws IOException {
            if (depth > 4) throw invalid(); space(); if (offset == text.length()) throw invalid();
            char first = text.charAt(offset);
            if (first == '"') return string();
            if (take('{')) {
                Map<String, Object> result = new HashMap<>();
                if (take('}')) return result;
                do { String key = string(); require(':'); if (result.containsKey(key)) throw invalid(); result.put(key, value(depth + 1)); } while (take(','));
                require('}'); return result;
            }
            if (take('[')) {
                List<Object> result = new ArrayList<>();
                if (take(']')) return result;
                do { if (result.size() >= 16) throw invalid(); result.add(value(depth + 1)); } while (take(','));
                require(']'); return result;
            }
            for (String literal : new String[]{"true", "false", "null"}) if (text.startsWith(literal, offset)) {
                offset += literal.length(); return "null".equals(literal) ? null : Boolean.valueOf(literal);
            }
            int begin = offset;
            while (offset < text.length() && "0123456789eE+-.".indexOf(text.charAt(offset)) >= 0) offset++;
            String number = text.substring(begin, offset);
            if (!number.matches("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?") || number.length() > 64) throw invalid();
            try { return new BigDecimal(number); } catch (NumberFormatException error) { throw invalid(); }
        }
        String string() throws IOException {
            require('"'); StringBuilder result = new StringBuilder();
            while (offset < text.length()) {
                char c = text.charAt(offset++);
                if (c == '"') {
                    for (int i = 0; i < result.length(); i++) {
                        char unit = result.charAt(i);
                        if (Character.isHighSurrogate(unit)) { if (++i == result.length() || !Character.isLowSurrogate(result.charAt(i))) throw invalid(); }
                        else if (Character.isLowSurrogate(unit)) throw invalid();
                    }
                    return result.toString();
                }
                if (c < 32) throw invalid();
                if (c == '\\') {
                    if (offset == text.length()) throw invalid(); c = text.charAt(offset++);
                    switch (c) {
                        case '"': case '\\': case '/': break;
                        case 'b': c = '\b'; break; case 'f': c = '\f'; break; case 'n': c = '\n'; break;
                        case 'r': c = '\r'; break; case 't': c = '\t'; break;
                        case 'u':
                            int code = 0;
                            for (int i = 0; i < 4; i++) { if (offset == text.length()) throw invalid(); int digit = "0123456789abcdef".indexOf(Character.toLowerCase(text.charAt(offset++))); if (digit < 0) throw invalid(); code = code * 16 + digit; }
                            c = (char) code; break;
                        default: throw invalid();
                    }
                }
                result.append(c);
            }
            throw invalid();
        }
    }
}
