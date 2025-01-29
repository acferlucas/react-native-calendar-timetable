import React, { useMemo, useRef } from "react";
import { useWindowDimensions, View, Animated } from "react-native";
import NowLine from "./components/NowLine";
import { clusterizer, prepareTimetable, setClusterWidth, setNodesPosition } from "./helpers/eventsPreparer";
import { dateRangesOverlap, daysDiff, minDiff, normalizeTime } from "./helpers/date";
import { CardProps, Day, TimetableProps } from "./types";
import Headers from "./components/Headers";
import Hours from "./components/Hours";

function withDefault<A>(value: A, defaultValue: NonNullable<A>) {
    return typeof value === "undefined" ? defaultValue : value as NonNullable<A>;
}

function Timetable<I>({
    items,
    renderItem,
    date,
    range: rangeProp,
    fromHour = 0,
    toHour = 24,

    style,

    width,
    timeWidth = 50,
    itemMinHeightInMinutes = 25,
    hourHeight = 60,
    linesTopOffset = 18,
    linesLeftInset = 15,
    columnHorizontalPadding = 10,

    stickyHours,
    renderHeader,
    renderHour,
    startProperty = 'startDate' as keyof I,
    endProperty = 'endDate' as keyof I,
    ...props
}: TimetableProps<I>) {
    const screenWidth = useWindowDimensions().width;

    const range = {
        from: normalizeTime(date || rangeProp?.from),
        till: normalizeTime(date || rangeProp?.till, 23, 59, 59, 999),
    };

    const columnDays = React.useMemo<Day[]>(() => {
        const amountOfDays = daysDiff(range.till, range.from) + 1;
        const days = [];

        for (let i = 0; i < amountOfDays; i++) {
            const date = new Date(range.from);
            date.setDate(date.getDate() + i);

            const start = new Date(date);
            start.setHours(fromHour, 0, 0, 0);

            const end = new Date(date);
            end.setHours(toHour - 1, 59, 59, 999);

            days.push({ date, start, end });
        }

        return days;
    }, [range.from, range.till, fromHour, toHour]);

    const scrollX = useRef(new Animated.Value(0)).current;

    const linesLeftOffset = timeWidth - linesLeftInset;
    const minuteHeight = hourHeight / 60;
    const columnWidth = withDefault(props.columnWidth, (width || screenWidth) - (timeWidth - linesLeftInset));

    const calculateTopOffset = (date: number) => {
        const d = new Date(date);
        return (Math.max((d.getHours() - fromHour), 0) * 60 + d.getMinutes()) * minuteHeight + linesTopOffset;
    };

    const fixedEventWidth = 100; // Defina a largura fixa desejada
    const eventGap = 10; // Defina o gap desejado entre os eventos

    const cards = useMemo(() => {
        if (!Array.isArray(items))
            return [];

        const positionedEvents: CardProps<I>[] = [];
        const itemMinHeight = Math.max(itemMinHeightInMinutes, 25);

        columnDays.forEach((columnDay, columnIndex) => {
            // Filtra eventos pela data da coluna
            const filteredItems = items.filter(item => dateRangesOverlap(
                columnDay.start,
                columnDay.end,
                new Date(item[startProperty] as any),
                new Date(item[endProperty] as any)
            ));

            // Se não houver eventos filtrados, pula o processo
            if (!filteredItems?.length)
                return;

            const { preparedEvents, minutes } = prepareTimetable(filteredItems, startProperty, endProperty, itemMinHeight, columnDay);
            const clusteredTimetable = clusterizer(preparedEvents, minutes);
            setClusterWidth(clusteredTimetable, columnWidth);
            setNodesPosition(clusteredTimetable);

            preparedEvents.forEach((event, eventIndex) => {
                const itemStart = new Date(event[startProperty] as any);
                const itemEnd = new Date(event[endProperty] as any);
                const itemMinEnd = new Date(itemStart);
                itemMinEnd.setMinutes(itemStart.getMinutes() + itemMinHeight);
                const daysTotal = daysDiff(+itemStart, +itemEnd) + 1;

                // O card começa no início da coluna ou no horário de início do item, o que for maior
                const start = Math.max(+columnDay.start, +itemStart);
                // O card termina no final da coluna ou no horário de término do item, o que for menor
                const end = Math.min(+columnDay.end + 1, Math.max(+itemEnd, +itemMinEnd));

                const left = linesLeftOffset + (fixedEventWidth + eventGap) * eventIndex;

                positionedEvents.push({
                    key: columnIndex + event.key,
                    item: event,
                    daysTotal,
                    style: {
                        position: 'absolute',
                        zIndex: 2,
                        top: calculateTopOffset(start),
                        left,
                        height: minDiff(start, end) * minuteHeight,
                        width: fixedEventWidth,
                    },
                });
            });
        });

        return positionedEvents;
    }, [
        items,
        columnDays,
        startProperty,
        endProperty,
        columnWidth,
        columnHorizontalPadding,
        linesLeftOffset,
        linesLeftInset,
        minuteHeight,
    ]);

    // Calcula a largura total necessária para o Timetable
    const totalEvents = items.length;
    const totalWidth = linesLeftOffset + (fixedEventWidth + eventGap) * totalEvents;

    return (
        <Animated.ScrollView
            horizontal={true}
            snapToInterval={props.enableSnapping ? columnWidth : undefined}
            onScroll={stickyHours ? Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                useNativeDriver: false,
            }) : undefined}
            {...props.scrollViewProps}
        >
            <View style={[style?.container, { width: totalWidth }]}>
                <Headers
                    headersContainer={style?.headersContainer}
                    columnDays={columnDays}
                    columnWidth={columnWidth}
                    linesTopOffset={linesTopOffset}
                    linesLeftOffset={linesLeftOffset}
                    renderHeader={renderHeader}
                    headerContainerStyle={style?.headerContainer}
                    headerTextStyle={style?.headerText}
                />

                <View style={style?.contentContainer}>
                    <Hours
                        offsetX={scrollX}
                        columnDays={columnDays}
                        columnWidth={columnWidth}
                        linesTopOffset={linesTopOffset}
                        linesLeftOffset={linesLeftOffset}
                        fromHour={fromHour}
                        toHour={toHour}
                        hourHeight={hourHeight}
                        timeWidth={timeWidth}
                        timeStyle={style?.time}
                        timeContainerStyle={style?.timeContainer}
                        linesStyle={style?.lines}
                        is12Hour={props?.is12Hour}
                        renderHour={renderHour}
                    />

                    {!props.hideNowLine && (
                        <NowLine
                            style={style?.nowLine}
                            calculateTopOffset={calculateTopOffset}
                            left={linesLeftOffset}
                            width={columnWidth * columnDays.length}
                        />
                    )}

                    {/* Cards */}
                    {!!renderItem && cards.map(renderItem)}
                </View>
            </View>
        </Animated.ScrollView>
    );
}

export default Timetable;
