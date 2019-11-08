/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 157.0, "minX": 0.0, "maxY": 4878.0, "series": [{"data": [[0.0, 157.0], [0.1, 159.0], [0.2, 171.0], [0.3, 171.0], [0.4, 185.0], [0.5, 185.0], [0.6, 185.0], [0.7, 186.0], [0.8, 189.0], [0.9, 190.0], [1.0, 190.0], [1.1, 190.0], [1.2, 191.0], [1.3, 191.0], [1.4, 192.0], [1.5, 195.0], [1.6, 196.0], [1.7, 196.0], [1.8, 201.0], [1.9, 201.0], [2.0, 203.0], [2.1, 203.0], [2.2, 203.0], [2.3, 203.0], [2.4, 203.0], [2.5, 204.0], [2.6, 204.0], [2.7, 211.0], [2.8, 211.0], [2.9, 212.0], [3.0, 213.0], [3.1, 214.0], [3.2, 216.0], [3.3, 216.0], [3.4, 218.0], [3.5, 220.0], [3.6, 221.0], [3.7, 224.0], [3.8, 225.0], [3.9, 226.0], [4.0, 227.0], [4.1, 231.0], [4.2, 232.0], [4.3, 238.0], [4.4, 239.0], [4.5, 239.0], [4.6, 241.0], [4.7, 260.0], [4.8, 262.0], [4.9, 266.0], [5.0, 271.0], [5.1, 279.0], [5.2, 280.0], [5.3, 282.0], [5.4, 283.0], [5.5, 287.0], [5.6, 287.0], [5.7, 288.0], [5.8, 288.0], [5.9, 289.0], [6.0, 291.0], [6.1, 292.0], [6.2, 292.0], [6.3, 296.0], [6.4, 296.0], [6.5, 297.0], [6.6, 298.0], [6.7, 308.0], [6.8, 308.0], [6.9, 310.0], [7.0, 311.0], [7.1, 314.0], [7.2, 318.0], [7.3, 320.0], [7.4, 323.0], [7.5, 326.0], [7.6, 327.0], [7.7, 335.0], [7.8, 335.0], [7.9, 336.0], [8.0, 336.0], [8.1, 337.0], [8.2, 342.0], [8.3, 344.0], [8.4, 345.0], [8.5, 348.0], [8.6, 349.0], [8.7, 349.0], [8.8, 351.0], [8.9, 361.0], [9.0, 368.0], [9.1, 368.0], [9.2, 379.0], [9.3, 398.0], [9.4, 427.0], [9.5, 518.0], [9.6, 784.0], [9.7, 798.0], [9.8, 817.0], [9.9, 836.0], [10.0, 836.0], [10.1, 848.0], [10.2, 850.0], [10.3, 888.0], [10.4, 920.0], [10.5, 947.0], [10.6, 951.0], [10.7, 966.0], [10.8, 967.0], [10.9, 991.0], [11.0, 997.0], [11.1, 1004.0], [11.2, 1004.0], [11.3, 1009.0], [11.4, 1010.0], [11.5, 1021.0], [11.6, 1032.0], [11.7, 1037.0], [11.8, 1075.0], [11.9, 1076.0], [12.0, 1086.0], [12.1, 1102.0], [12.2, 1102.0], [12.3, 1103.0], [12.4, 1114.0], [12.5, 1120.0], [12.6, 1122.0], [12.7, 1127.0], [12.8, 1127.0], [12.9, 1130.0], [13.0, 1131.0], [13.1, 1148.0], [13.2, 1148.0], [13.3, 1154.0], [13.4, 1169.0], [13.5, 1171.0], [13.6, 1177.0], [13.7, 1178.0], [13.8, 1193.0], [13.9, 1208.0], [14.0, 1213.0], [14.1, 1216.0], [14.2, 1217.0], [14.3, 1220.0], [14.4, 1233.0], [14.5, 1235.0], [14.6, 1249.0], [14.7, 1272.0], [14.8, 1272.0], [14.9, 1275.0], [15.0, 1283.0], [15.1, 1285.0], [15.2, 1294.0], [15.3, 1306.0], [15.4, 1307.0], [15.5, 1308.0], [15.6, 1309.0], [15.7, 1309.0], [15.8, 1316.0], [15.9, 1325.0], [16.0, 1331.0], [16.1, 1331.0], [16.2, 1336.0], [16.3, 1338.0], [16.4, 1340.0], [16.5, 1341.0], [16.6, 1343.0], [16.7, 1345.0], [16.8, 1347.0], [16.9, 1353.0], [17.0, 1364.0], [17.1, 1367.0], [17.2, 1368.0], [17.3, 1369.0], [17.4, 1373.0], [17.5, 1380.0], [17.6, 1385.0], [17.7, 1386.0], [17.8, 1387.0], [17.9, 1391.0], [18.0, 1398.0], [18.1, 1400.0], [18.2, 1400.0], [18.3, 1404.0], [18.4, 1405.0], [18.5, 1410.0], [18.6, 1410.0], [18.7, 1411.0], [18.8, 1413.0], [18.9, 1419.0], [19.0, 1430.0], [19.1, 1431.0], [19.2, 1431.0], [19.3, 1436.0], [19.4, 1436.0], [19.5, 1446.0], [19.6, 1448.0], [19.7, 1448.0], [19.8, 1456.0], [19.9, 1467.0], [20.0, 1468.0], [20.1, 1472.0], [20.2, 1473.0], [20.3, 1474.0], [20.4, 1475.0], [20.5, 1479.0], [20.6, 1481.0], [20.7, 1483.0], [20.8, 1486.0], [20.9, 1493.0], [21.0, 1493.0], [21.1, 1494.0], [21.2, 1495.0], [21.3, 1496.0], [21.4, 1497.0], [21.5, 1498.0], [21.6, 1502.0], [21.7, 1515.0], [21.8, 1517.0], [21.9, 1534.0], [22.0, 1541.0], [22.1, 1545.0], [22.2, 1549.0], [22.3, 1550.0], [22.4, 1551.0], [22.5, 1552.0], [22.6, 1552.0], [22.7, 1557.0], [22.8, 1562.0], [22.9, 1567.0], [23.0, 1570.0], [23.1, 1577.0], [23.2, 1578.0], [23.3, 1579.0], [23.4, 1581.0], [23.5, 1584.0], [23.6, 1587.0], [23.7, 1587.0], [23.8, 1589.0], [23.9, 1591.0], [24.0, 1593.0], [24.1, 1594.0], [24.2, 1605.0], [24.3, 1607.0], [24.4, 1612.0], [24.5, 1612.0], [24.6, 1624.0], [24.7, 1625.0], [24.8, 1626.0], [24.9, 1627.0], [25.0, 1628.0], [25.1, 1631.0], [25.2, 1631.0], [25.3, 1635.0], [25.4, 1636.0], [25.5, 1640.0], [25.6, 1646.0], [25.7, 1650.0], [25.8, 1651.0], [25.9, 1651.0], [26.0, 1656.0], [26.1, 1659.0], [26.2, 1662.0], [26.3, 1663.0], [26.4, 1673.0], [26.5, 1677.0], [26.6, 1689.0], [26.7, 1690.0], [26.8, 1692.0], [26.9, 1695.0], [27.0, 1696.0], [27.1, 1696.0], [27.2, 1697.0], [27.3, 1697.0], [27.4, 1704.0], [27.5, 1712.0], [27.6, 1718.0], [27.7, 1721.0], [27.8, 1721.0], [27.9, 1722.0], [28.0, 1724.0], [28.1, 1727.0], [28.2, 1731.0], [28.3, 1735.0], [28.4, 1736.0], [28.5, 1738.0], [28.6, 1748.0], [28.7, 1750.0], [28.8, 1755.0], [28.9, 1758.0], [29.0, 1765.0], [29.1, 1765.0], [29.2, 1768.0], [29.3, 1769.0], [29.4, 1774.0], [29.5, 1776.0], [29.6, 1779.0], [29.7, 1781.0], [29.8, 1788.0], [29.9, 1795.0], [30.0, 1800.0], [30.1, 1802.0], [30.2, 1803.0], [30.3, 1803.0], [30.4, 1803.0], [30.5, 1807.0], [30.6, 1813.0], [30.7, 1816.0], [30.8, 1825.0], [30.9, 1839.0], [31.0, 1844.0], [31.1, 1847.0], [31.2, 1851.0], [31.3, 1859.0], [31.4, 1863.0], [31.5, 1867.0], [31.6, 1872.0], [31.7, 1874.0], [31.8, 1876.0], [31.9, 1879.0], [32.0, 1879.0], [32.1, 1882.0], [32.2, 1882.0], [32.3, 1883.0], [32.4, 1885.0], [32.5, 1888.0], [32.6, 1889.0], [32.7, 1889.0], [32.8, 1895.0], [32.9, 1900.0], [33.0, 1903.0], [33.1, 1905.0], [33.2, 1915.0], [33.3, 1916.0], [33.4, 1917.0], [33.5, 1918.0], [33.6, 1919.0], [33.7, 1919.0], [33.8, 1921.0], [33.9, 1924.0], [34.0, 1929.0], [34.1, 1935.0], [34.2, 1939.0], [34.3, 1941.0], [34.4, 1945.0], [34.5, 1950.0], [34.6, 1950.0], [34.7, 1950.0], [34.8, 1955.0], [34.9, 1957.0], [35.0, 1957.0], [35.1, 1958.0], [35.2, 1973.0], [35.3, 1975.0], [35.4, 1977.0], [35.5, 1984.0], [35.6, 1985.0], [35.7, 1986.0], [35.8, 1988.0], [35.9, 1988.0], [36.0, 1989.0], [36.1, 1989.0], [36.2, 1990.0], [36.3, 1990.0], [36.4, 1991.0], [36.5, 1991.0], [36.6, 1992.0], [36.7, 1993.0], [36.8, 1996.0], [36.9, 1997.0], [37.0, 2002.0], [37.1, 2003.0], [37.2, 2004.0], [37.3, 2005.0], [37.4, 2006.0], [37.5, 2007.0], [37.6, 2008.0], [37.7, 2009.0], [37.8, 2011.0], [37.9, 2012.0], [38.0, 2012.0], [38.1, 2014.0], [38.2, 2016.0], [38.3, 2021.0], [38.4, 2023.0], [38.5, 2026.0], [38.6, 2026.0], [38.7, 2027.0], [38.8, 2029.0], [38.9, 2030.0], [39.0, 2031.0], [39.1, 2042.0], [39.2, 2043.0], [39.3, 2044.0], [39.4, 2045.0], [39.5, 2046.0], [39.6, 2051.0], [39.7, 2052.0], [39.8, 2054.0], [39.9, 2063.0], [40.0, 2065.0], [40.1, 2073.0], [40.2, 2076.0], [40.3, 2077.0], [40.4, 2081.0], [40.5, 2082.0], [40.6, 2086.0], [40.7, 2089.0], [40.8, 2100.0], [40.9, 2102.0], [41.0, 2103.0], [41.1, 2104.0], [41.2, 2106.0], [41.3, 2107.0], [41.4, 2111.0], [41.5, 2111.0], [41.6, 2111.0], [41.7, 2112.0], [41.8, 2113.0], [41.9, 2114.0], [42.0, 2115.0], [42.1, 2116.0], [42.2, 2124.0], [42.3, 2129.0], [42.4, 2134.0], [42.5, 2135.0], [42.6, 2135.0], [42.7, 2136.0], [42.8, 2140.0], [42.9, 2143.0], [43.0, 2149.0], [43.1, 2151.0], [43.2, 2152.0], [43.3, 2156.0], [43.4, 2156.0], [43.5, 2158.0], [43.6, 2165.0], [43.7, 2166.0], [43.8, 2166.0], [43.9, 2170.0], [44.0, 2172.0], [44.1, 2174.0], [44.2, 2176.0], [44.3, 2182.0], [44.4, 2184.0], [44.5, 2184.0], [44.6, 2188.0], [44.7, 2199.0], [44.8, 2199.0], [44.9, 2206.0], [45.0, 2211.0], [45.1, 2214.0], [45.2, 2220.0], [45.3, 2222.0], [45.4, 2244.0], [45.5, 2245.0], [45.6, 2247.0], [45.7, 2250.0], [45.8, 2250.0], [45.9, 2255.0], [46.0, 2269.0], [46.1, 2274.0], [46.2, 2275.0], [46.3, 2276.0], [46.4, 2277.0], [46.5, 2288.0], [46.6, 2291.0], [46.7, 2296.0], [46.8, 2304.0], [46.9, 2309.0], [47.0, 2315.0], [47.1, 2316.0], [47.2, 2316.0], [47.3, 2317.0], [47.4, 2318.0], [47.5, 2330.0], [47.6, 2334.0], [47.7, 2343.0], [47.8, 2345.0], [47.9, 2355.0], [48.0, 2359.0], [48.1, 2359.0], [48.2, 2361.0], [48.3, 2363.0], [48.4, 2364.0], [48.5, 2364.0], [48.6, 2367.0], [48.7, 2370.0], [48.8, 2371.0], [48.9, 2374.0], [49.0, 2375.0], [49.1, 2375.0], [49.2, 2381.0], [49.3, 2384.0], [49.4, 2387.0], [49.5, 2389.0], [49.6, 2389.0], [49.7, 2390.0], [49.8, 2394.0], [49.9, 2396.0], [50.0, 2396.0], [50.1, 2399.0], [50.2, 2400.0], [50.3, 2405.0], [50.4, 2406.0], [50.5, 2407.0], [50.6, 2408.0], [50.7, 2409.0], [50.8, 2410.0], [50.9, 2411.0], [51.0, 2414.0], [51.1, 2414.0], [51.2, 2416.0], [51.3, 2420.0], [51.4, 2421.0], [51.5, 2424.0], [51.6, 2429.0], [51.7, 2436.0], [51.8, 2441.0], [51.9, 2441.0], [52.0, 2445.0], [52.1, 2445.0], [52.2, 2446.0], [52.3, 2456.0], [52.4, 2460.0], [52.5, 2462.0], [52.6, 2469.0], [52.7, 2470.0], [52.8, 2473.0], [52.9, 2476.0], [53.0, 2476.0], [53.1, 2477.0], [53.2, 2478.0], [53.3, 2484.0], [53.4, 2491.0], [53.5, 2494.0], [53.6, 2495.0], [53.7, 2496.0], [53.8, 2498.0], [53.9, 2499.0], [54.0, 2502.0], [54.1, 2505.0], [54.2, 2509.0], [54.3, 2509.0], [54.4, 2511.0], [54.5, 2520.0], [54.6, 2526.0], [54.7, 2526.0], [54.8, 2527.0], [54.9, 2529.0], [55.0, 2541.0], [55.1, 2541.0], [55.2, 2542.0], [55.3, 2545.0], [55.4, 2545.0], [55.5, 2546.0], [55.6, 2547.0], [55.7, 2551.0], [55.8, 2555.0], [55.9, 2559.0], [56.0, 2562.0], [56.1, 2564.0], [56.2, 2566.0], [56.3, 2568.0], [56.4, 2569.0], [56.5, 2571.0], [56.6, 2571.0], [56.7, 2575.0], [56.8, 2575.0], [56.9, 2575.0], [57.0, 2577.0], [57.1, 2581.0], [57.2, 2591.0], [57.3, 2592.0], [57.4, 2593.0], [57.5, 2601.0], [57.6, 2601.0], [57.7, 2603.0], [57.8, 2604.0], [57.9, 2608.0], [58.0, 2613.0], [58.1, 2616.0], [58.2, 2625.0], [58.3, 2629.0], [58.4, 2630.0], [58.5, 2637.0], [58.6, 2648.0], [58.7, 2648.0], [58.8, 2653.0], [58.9, 2655.0], [59.0, 2661.0], [59.1, 2664.0], [59.2, 2666.0], [59.3, 2667.0], [59.4, 2670.0], [59.5, 2671.0], [59.6, 2672.0], [59.7, 2676.0], [59.8, 2678.0], [59.9, 2679.0], [60.0, 2680.0], [60.1, 2680.0], [60.2, 2682.0], [60.3, 2685.0], [60.4, 2694.0], [60.5, 2697.0], [60.6, 2698.0], [60.7, 2702.0], [60.8, 2702.0], [60.9, 2707.0], [61.0, 2709.0], [61.1, 2710.0], [61.2, 2722.0], [61.3, 2733.0], [61.4, 2735.0], [61.5, 2735.0], [61.6, 2738.0], [61.7, 2741.0], [61.8, 2746.0], [61.9, 2746.0], [62.0, 2747.0], [62.1, 2748.0], [62.2, 2758.0], [62.3, 2762.0], [62.4, 2765.0], [62.5, 2783.0], [62.6, 2788.0], [62.7, 2792.0], [62.8, 2793.0], [62.9, 2797.0], [63.0, 2799.0], [63.1, 2802.0], [63.2, 2806.0], [63.3, 2811.0], [63.4, 2813.0], [63.5, 2815.0], [63.6, 2815.0], [63.7, 2817.0], [63.8, 2820.0], [63.9, 2823.0], [64.0, 2824.0], [64.1, 2825.0], [64.2, 2825.0], [64.3, 2835.0], [64.4, 2837.0], [64.5, 2840.0], [64.6, 2841.0], [64.7, 2847.0], [64.8, 2857.0], [64.9, 2860.0], [65.0, 2861.0], [65.1, 2867.0], [65.2, 2878.0], [65.3, 2883.0], [65.4, 2885.0], [65.5, 2887.0], [65.6, 2895.0], [65.7, 2900.0], [65.8, 2904.0], [65.9, 2905.0], [66.0, 2906.0], [66.1, 2906.0], [66.2, 2907.0], [66.3, 2908.0], [66.4, 2919.0], [66.5, 2920.0], [66.6, 2921.0], [66.7, 2929.0], [66.8, 2936.0], [66.9, 2937.0], [67.0, 2940.0], [67.1, 2941.0], [67.2, 2942.0], [67.3, 2944.0], [67.4, 2944.0], [67.5, 2950.0], [67.6, 2956.0], [67.7, 2958.0], [67.8, 2959.0], [67.9, 2966.0], [68.0, 2967.0], [68.1, 2967.0], [68.2, 2981.0], [68.3, 2983.0], [68.4, 2983.0], [68.5, 2989.0], [68.6, 2991.0], [68.7, 2992.0], [68.8, 2995.0], [68.9, 2999.0], [69.0, 2999.0], [69.1, 3000.0], [69.2, 3005.0], [69.3, 3007.0], [69.4, 3008.0], [69.5, 3011.0], [69.6, 3012.0], [69.7, 3015.0], [69.8, 3016.0], [69.9, 3017.0], [70.0, 3027.0], [70.1, 3028.0], [70.2, 3030.0], [70.3, 3038.0], [70.4, 3042.0], [70.5, 3044.0], [70.6, 3044.0], [70.7, 3047.0], [70.8, 3049.0], [70.9, 3053.0], [71.0, 3055.0], [71.1, 3056.0], [71.2, 3057.0], [71.3, 3069.0], [71.4, 3069.0], [71.5, 3070.0], [71.6, 3073.0], [71.7, 3076.0], [71.8, 3078.0], [71.9, 3079.0], [72.0, 3080.0], [72.1, 3083.0], [72.2, 3084.0], [72.3, 3084.0], [72.4, 3092.0], [72.5, 3094.0], [72.6, 3094.0], [72.7, 3097.0], [72.8, 3100.0], [72.9, 3102.0], [73.0, 3110.0], [73.1, 3112.0], [73.2, 3117.0], [73.3, 3118.0], [73.4, 3119.0], [73.5, 3135.0], [73.6, 3136.0], [73.7, 3139.0], [73.8, 3139.0], [73.9, 3144.0], [74.0, 3148.0], [74.1, 3152.0], [74.2, 3153.0], [74.3, 3157.0], [74.4, 3158.0], [74.5, 3160.0], [74.6, 3160.0], [74.7, 3162.0], [74.8, 3169.0], [74.9, 3170.0], [75.0, 3175.0], [75.1, 3176.0], [75.2, 3176.0], [75.3, 3179.0], [75.4, 3188.0], [75.5, 3197.0], [75.6, 3201.0], [75.7, 3204.0], [75.8, 3206.0], [75.9, 3206.0], [76.0, 3206.0], [76.1, 3208.0], [76.2, 3208.0], [76.3, 3212.0], [76.4, 3218.0], [76.5, 3219.0], [76.6, 3220.0], [76.7, 3222.0], [76.8, 3225.0], [76.9, 3228.0], [77.0, 3229.0], [77.1, 3234.0], [77.2, 3237.0], [77.3, 3237.0], [77.4, 3238.0], [77.5, 3238.0], [77.6, 3239.0], [77.7, 3241.0], [77.8, 3252.0], [77.9, 3258.0], [78.0, 3263.0], [78.1, 3265.0], [78.2, 3286.0], [78.3, 3287.0], [78.4, 3288.0], [78.5, 3292.0], [78.6, 3296.0], [78.7, 3301.0], [78.8, 3303.0], [78.9, 3306.0], [79.0, 3307.0], [79.1, 3309.0], [79.2, 3323.0], [79.3, 3336.0], [79.4, 3337.0], [79.5, 3339.0], [79.6, 3344.0], [79.7, 3351.0], [79.8, 3359.0], [79.9, 3361.0], [80.0, 3361.0], [80.1, 3366.0], [80.2, 3368.0], [80.3, 3372.0], [80.4, 3380.0], [80.5, 3381.0], [80.6, 3381.0], [80.7, 3382.0], [80.8, 3383.0], [80.9, 3386.0], [81.0, 3389.0], [81.1, 3389.0], [81.2, 3390.0], [81.3, 3394.0], [81.4, 3399.0], [81.5, 3400.0], [81.6, 3405.0], [81.7, 3409.0], [81.8, 3411.0], [81.9, 3412.0], [82.0, 3417.0], [82.1, 3419.0], [82.2, 3421.0], [82.3, 3427.0], [82.4, 3428.0], [82.5, 3435.0], [82.6, 3438.0], [82.7, 3442.0], [82.8, 3443.0], [82.9, 3445.0], [83.0, 3453.0], [83.1, 3454.0], [83.2, 3454.0], [83.3, 3456.0], [83.4, 3458.0], [83.5, 3459.0], [83.6, 3461.0], [83.7, 3462.0], [83.8, 3467.0], [83.9, 3471.0], [84.0, 3474.0], [84.1, 3477.0], [84.2, 3480.0], [84.3, 3481.0], [84.4, 3486.0], [84.5, 3486.0], [84.6, 3492.0], [84.7, 3493.0], [84.8, 3497.0], [84.9, 3500.0], [85.0, 3506.0], [85.1, 3508.0], [85.2, 3509.0], [85.3, 3510.0], [85.4, 3511.0], [85.5, 3517.0], [85.6, 3520.0], [85.7, 3526.0], [85.8, 3528.0], [85.9, 3529.0], [86.0, 3536.0], [86.1, 3537.0], [86.2, 3540.0], [86.3, 3540.0], [86.4, 3552.0], [86.5, 3555.0], [86.6, 3557.0], [86.7, 3557.0], [86.8, 3562.0], [86.9, 3569.0], [87.0, 3576.0], [87.1, 3578.0], [87.2, 3586.0], [87.3, 3598.0], [87.4, 3600.0], [87.5, 3604.0], [87.6, 3604.0], [87.7, 3607.0], [87.8, 3609.0], [87.9, 3611.0], [88.0, 3617.0], [88.1, 3617.0], [88.2, 3617.0], [88.3, 3618.0], [88.4, 3620.0], [88.5, 3628.0], [88.6, 3630.0], [88.7, 3631.0], [88.8, 3639.0], [88.9, 3654.0], [89.0, 3657.0], [89.1, 3657.0], [89.2, 3658.0], [89.3, 3673.0], [89.4, 3681.0], [89.5, 3688.0], [89.6, 3689.0], [89.7, 3689.0], [89.8, 3696.0], [89.9, 3700.0], [90.0, 3711.0], [90.1, 3713.0], [90.2, 3720.0], [90.3, 3725.0], [90.4, 3734.0], [90.5, 3746.0], [90.6, 3747.0], [90.7, 3747.0], [90.8, 3752.0], [90.9, 3752.0], [91.0, 3753.0], [91.1, 3754.0], [91.2, 3755.0], [91.3, 3764.0], [91.4, 3764.0], [91.5, 3766.0], [91.6, 3776.0], [91.7, 3781.0], [91.8, 3785.0], [91.9, 3794.0], [92.0, 3802.0], [92.1, 3804.0], [92.2, 3805.0], [92.3, 3806.0], [92.4, 3807.0], [92.5, 3807.0], [92.6, 3809.0], [92.7, 3812.0], [92.8, 3813.0], [92.9, 3835.0], [93.0, 3837.0], [93.1, 3841.0], [93.2, 3842.0], [93.3, 3842.0], [93.4, 3848.0], [93.5, 3856.0], [93.6, 3863.0], [93.7, 3867.0], [93.8, 3883.0], [93.9, 3883.0], [94.0, 3899.0], [94.1, 3905.0], [94.2, 3919.0], [94.3, 3926.0], [94.4, 3930.0], [94.5, 3934.0], [94.6, 3939.0], [94.7, 3939.0], [94.8, 3947.0], [94.9, 3949.0], [95.0, 3950.0], [95.1, 3951.0], [95.2, 3955.0], [95.3, 3959.0], [95.4, 3962.0], [95.5, 3968.0], [95.6, 3973.0], [95.7, 3990.0], [95.8, 3992.0], [95.9, 4013.0], [96.0, 4015.0], [96.1, 4017.0], [96.2, 4019.0], [96.3, 4019.0], [96.4, 4022.0], [96.5, 4028.0], [96.6, 4033.0], [96.7, 4061.0], [96.8, 4062.0], [96.9, 4067.0], [97.0, 4072.0], [97.1, 4074.0], [97.2, 4081.0], [97.3, 4098.0], [97.4, 4104.0], [97.5, 4143.0], [97.6, 4162.0], [97.7, 4163.0], [97.8, 4175.0], [97.9, 4175.0], [98.0, 4176.0], [98.1, 4195.0], [98.2, 4246.0], [98.3, 4249.0], [98.4, 4253.0], [98.5, 4282.0], [98.6, 4295.0], [98.7, 4302.0], [98.8, 4302.0], [98.9, 4331.0], [99.0, 4358.0], [99.1, 4361.0], [99.2, 4391.0], [99.3, 4421.0], [99.4, 4576.0], [99.5, 4611.0], [99.6, 4624.0], [99.7, 4729.0], [99.8, 4831.0], [99.9, 4878.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 49.0, "series": [{"data": [[700.0, 2.0], [800.0, 6.0], [900.0, 7.0], [1000.0, 10.0], [1100.0, 18.0], [1200.0, 14.0], [1300.0, 28.0], [1400.0, 34.0], [1500.0, 26.0], [100.0, 18.0], [1600.0, 32.0], [1700.0, 26.0], [1800.0, 29.0], [1900.0, 41.0], [2000.0, 38.0], [2100.0, 41.0], [2300.0, 34.0], [2200.0, 19.0], [2400.0, 38.0], [2500.0, 35.0], [2600.0, 32.0], [2700.0, 24.0], [2800.0, 26.0], [2900.0, 34.0], [3000.0, 37.0], [3100.0, 28.0], [200.0, 49.0], [3200.0, 32.0], [3300.0, 28.0], [3400.0, 34.0], [3500.0, 25.0], [3600.0, 25.0], [3700.0, 21.0], [3800.0, 21.0], [3900.0, 18.0], [4000.0, 15.0], [4300.0, 6.0], [4200.0, 5.0], [4100.0, 8.0], [4600.0, 2.0], [4500.0, 1.0], [4400.0, 1.0], [300.0, 27.0], [4700.0, 1.0], [4800.0, 2.0], [400.0, 1.0], [500.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 4800.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 95.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 785.0, "series": [{"data": [[1.0, 120.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 95.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 785.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 206.4940000000001, "minX": 1.549608E12, "maxY": 206.4940000000001, "series": [{"data": [[1.549608E12, 206.4940000000001]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 287.6666666666667, "minX": 1.0, "maxY": 4878.0, "series": [{"data": [[2.0, 3012.0], [3.0, 3139.0], [4.0, 2966.0], [5.0, 3112.0], [6.0, 2526.0], [7.0, 3030.0], [8.0, 2702.0], [9.0, 2989.0], [10.0, 2581.0], [11.0, 3139.0], [12.0, 3899.0], [13.0, 2410.0], [14.0, 2967.0], [15.0, 2495.0], [16.0, 3038.0], [17.0, 2748.0], [18.0, 3212.0], [19.0, 3084.0], [20.0, 540.2222222222222], [21.0, 305.1428571428571], [22.0, 531.125], [23.0, 527.5833333333333], [24.0, 687.8333333333333], [25.0, 966.75], [26.0, 358.5], [27.0, 2315.6666666666665], [28.0, 760.2], [29.0, 715.8], [30.0, 910.0], [31.0, 703.8333333333333], [33.0, 1049.6666666666665], [32.0, 1329.6666666666667], [35.0, 1355.5], [34.0, 1356.5], [37.0, 344.0], [36.0, 774.0], [39.0, 287.6666666666667], [38.0, 1668.5], [40.0, 1423.0], [41.0, 1252.3333333333335], [43.0, 3319.5], [45.0, 3990.0], [44.0, 2983.0], [47.0, 2407.0], [46.0, 2566.0], [49.0, 2499.0], [48.0, 3160.0], [51.0, 3011.0], [50.0, 2555.0], [53.0, 2604.0], [52.0, 3053.0], [55.0, 3604.0], [54.0, 2367.0], [57.0, 2476.0], [56.0, 2991.0], [59.0, 3814.5], [61.0, 3951.0], [60.0, 2364.0], [63.0, 2747.0], [62.0, 4163.0], [67.0, 3286.0], [66.0, 2288.0], [65.0, 2571.0], [64.0, 3537.0], [71.0, 3609.0], [70.0, 2473.0], [69.0, 2509.0], [68.0, 2678.0], [75.0, 2735.0], [74.0, 2214.0], [73.0, 3713.0], [78.0, 3234.0], [77.0, 3835.0], [76.0, 3390.0], [83.0, 2885.0], [82.0, 3084.0], [81.0, 3486.0], [80.0, 2534.5], [87.0, 3443.0], [86.0, 3250.5], [84.0, 2680.0], [91.0, 2184.0], [90.0, 2359.0], [89.0, 3657.0], [88.0, 3492.0], [92.0, 2236.5], [93.0, 1817.5], [95.0, 2136.5], [94.0, 3368.0], [99.0, 1283.3333333333333], [98.0, 2575.0], [97.0, 3657.0], [96.0, 3725.0], [103.0, 2616.0], [102.0, 2399.0], [101.0, 3578.0], [100.0, 2361.0], [107.0, 3007.0], [106.0, 3506.0], [105.0, 4015.0], [104.0, 3557.0], [111.0, 3781.0], [110.0, 3529.0], [109.0, 2156.0], [108.0, 2694.0], [112.0, 2385.5], [114.0, 2564.5], [115.0, 947.0], [113.0, 2172.0], [118.0, 1594.0], [119.0, 3339.0], [117.0, 3939.0], [116.0, 3164.5], [123.0, 3179.0], [122.0, 2562.0], [121.0, 2441.0], [120.0, 2547.0], [127.0, 1873.5], [126.0, 3042.0], [125.0, 2867.0], [124.0, 3229.0], [130.0, 1621.5], [135.0, 3713.0], [134.0, 3541.0], [132.0, 2950.0], [131.0, 4624.0], [129.0, 2664.0], [128.0, 2477.0], [136.0, 2038.5], [143.0, 2680.0], [142.0, 2671.0], [141.0, 3807.0], [140.0, 2211.0], [139.0, 3301.0], [138.0, 2797.0], [137.0, 2527.0], [145.0, 3033.0], [151.0, 1695.5], [150.0, 3959.0], [149.0, 2920.0], [148.0, 3586.0], [147.0, 2967.0], [146.0, 2359.0], [144.0, 2551.0], [155.0, 1601.6666666666665], [156.0, 2050.6666666666665], [159.0, 3118.0], [158.0, 3962.0], [157.0, 4391.0], [154.0, 2389.0], [153.0, 4143.0], [152.0, 3526.0], [161.0, 2120.5], [162.0, 1784.0], [163.0, 1622.4], [166.0, 2001.6666666666665], [167.0, 2252.3333333333335], [165.0, 3055.0], [164.0, 2601.0], [160.0, 3344.0], [168.0, 1990.75], [169.0, 1688.4], [170.0, 1272.3333333333333], [175.0, 1576.8], [174.0, 1805.6], [173.0, 2958.0], [172.0, 3939.0], [171.0, 2937.0], [179.0, 1518.1999999999998], [178.0, 1482.2], [177.0, 1885.8333333333335], [176.0, 1680.7], [182.0, 1394.0], [181.0, 2015.2], [180.0, 2209.0], [183.0, 2222.5], [186.0, 1842.0], [185.0, 1778.0], [187.0, 1736.3333333333333], [189.0, 1773.2], [190.0, 1862.6], [191.0, 4072.0], [188.0, 3361.0], [184.0, 2883.0], [192.0, 1784.0], [193.0, 2378.25], [194.0, 2160.0], [197.0, 1894.6666666666667], [199.0, 1945.3333333333335], [198.0, 3747.0], [196.0, 3458.0], [195.0, 1939.0], [203.0, 2316.0], [204.0, 1691.0], [202.0, 1850.75], [201.0, 1916.5714285714287], [200.0, 2166.25], [206.0, 2725.5], [207.0, 2411.0], [205.0, 3926.0], [208.0, 2286.0], [210.0, 2993.0], [211.0, 2038.6666666666665], [215.0, 2034.2222222222222], [214.0, 1885.6666666666667], [213.0, 1790.0], [212.0, 3066.5], [209.0, 3552.0], [216.0, 1724.6666666666665], [217.0, 2235.625], [218.0, 2442.166666666667], [219.0, 2170.153846153846], [221.0, 2103.5], [220.0, 2141.714285714286], [222.0, 2082.0], [223.0, 2142.0], [225.0, 2415.5], [224.0, 2509.714285714286], [226.0, 2219.25], [227.0, 2044.0], [228.0, 2951.0], [231.0, 2766.0], [230.0, 3867.0], [229.0, 3639.0], [232.0, 2796.5], [236.0, 1976.0], [239.0, 2131.0], [238.0, 4246.0], [237.0, 3688.0], [235.0, 3753.0], [234.0, 1813.0], [233.0, 3201.0], [241.0, 1794.6666666666667], [240.0, 1734.5], [247.0, 2014.5], [246.0, 2008.2857142857142], [245.0, 2589.2], [244.0, 2315.3333333333335], [243.0, 3135.0], [242.0, 2667.0], [248.0, 2460.5], [249.0, 2157.3333333333335], [251.0, 2133.6666666666665], [253.0, 2569.3333333333335], [252.0, 2058.8571428571427], [250.0, 2436.4], [255.0, 2402.0], [254.0, 3806.0], [257.0, 2288.75], [256.0, 2516.75], [258.0, 2516.75], [260.0, 2403.3333333333335], [259.0, 2342.6363636363635], [261.0, 2969.0], [262.0, 2328.3333333333335], [263.0, 2579.3333333333335], [264.0, 2241.5714285714284], [267.0, 3323.0], [266.0, 3767.0], [271.0, 1562.0], [270.0, 3883.0], [268.0, 3376.0], [269.0, 2466.5], [275.0, 2836.5], [274.0, 2549.0], [273.0, 2539.75], [276.0, 2953.0], [277.0, 3992.0], [280.0, 2513.6666666666665], [279.0, 2724.0], [272.0, 3412.0], [278.0, 3837.0], [281.0, 2738.0], [282.0, 2632.2], [283.0, 2668.6], [284.0, 3087.6666666666665], [286.0, 2833.5], [285.0, 2865.6666666666665], [287.0, 2655.0], [289.0, 3207.0], [288.0, 2609.5], [290.0, 2799.6666666666665], [291.0, 2866.5], [292.0, 2642.2], [296.0, 2429.333333333333], [302.0, 2767.5555555555557], [303.0, 2914.0], [301.0, 2428.25], [300.0, 2738.3333333333335], [297.0, 2156.0], [299.0, 2623.0], [298.0, 2646.75], [295.0, 2519.8], [294.0, 2579.5], [293.0, 2580.6666666666665], [318.0, 3813.0], [319.0, 4611.0], [317.0, 3785.0], [316.0, 3372.0], [315.0, 3681.0], [314.0, 2840.0], [313.0, 2603.0], [312.0, 2630.0], [311.0, 2400.0], [305.0, 3008.0], [304.0, 4878.0], [307.0, 3607.0], [306.0, 3747.0], [310.0, 3097.0], [309.0, 3618.0], [308.0, 3842.0], [334.0, 3500.0], [335.0, 2653.0], [333.0, 3100.0], [332.0, 3930.0], [331.0, 2559.0], [330.0, 3148.0], [329.0, 4729.0], [328.0, 3382.0], [327.0, 3480.0], [321.0, 3949.0], [320.0, 3934.0], [323.0, 3237.0], [322.0, 4361.0], [325.0, 3153.0], [324.0, 3222.0], [350.0, 4033.0], [351.0, 3206.0], [349.0, 3540.0], [348.0, 3336.0], [347.0, 3188.0], [346.0, 2666.0], [345.0, 3406.5], [343.0, 3905.0], [337.0, 4019.0], [336.0, 3620.0], [339.0, 3160.0], [338.0, 3658.0], [342.0, 3462.0], [341.0, 3170.0], [340.0, 2441.0], [366.0, 3841.0], [367.0, 3237.0], [365.0, 3400.0], [364.0, 3445.0], [363.0, 3511.0], [362.0, 3078.0], [361.0, 3000.0], [360.0, 3080.0], [359.0, 3477.0], [353.0, 2887.0], [352.0, 3284.0], [355.0, 4028.0], [354.0, 3598.0], [358.0, 2709.0], [357.0, 2815.0], [356.0, 2811.0], [376.0, 3360.75], [379.0, 2904.0], [380.0, 3138.0], [383.0, 2855.25], [382.0, 3118.3333333333335], [381.0, 3118.0], [371.0, 2986.4285714285716], [370.0, 3169.0], [369.0, 3471.0], [368.0, 3017.0], [378.0, 3497.0], [377.0, 2886.6], [375.0, 3177.5], [374.0, 3006.5], [373.0, 3161.6666666666665], [372.0, 2955.625], [385.0, 3399.75], [386.0, 3673.6666666666665], [389.0, 3391.6], [388.0, 3138.0], [387.0, 2834.0], [390.0, 3579.25], [391.0, 3431.0], [384.0, 3809.0], [392.0, 3480.5], [393.0, 3056.0], [395.0, 2823.0], [394.0, 2788.0], [398.0, 3077.0], [397.0, 3746.0], [396.0, 3617.0], [399.0, 3094.0], [1.0, 3144.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[206.4940000000001, 2342.601000000001]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 399.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 6250.0, "minX": 1.549608E12, "maxY": 7015.933333333333, "series": [{"data": [[1.549608E12, 7015.933333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.549608E12, 6250.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 2342.601000000001, "minX": 1.549608E12, "maxY": 2342.601000000001, "series": [{"data": [[1.549608E12, 2342.601000000001]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.549608E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 2342.592999999999, "minX": 1.549608E12, "maxY": 2342.592999999999, "series": [{"data": [[1.549608E12, 2342.592999999999]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.549608E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 39.14199999999998, "minX": 1.549608E12, "maxY": 39.14199999999998, "series": [{"data": [[1.549608E12, 39.14199999999998]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.549608E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 157.0, "minX": 1.549608E12, "maxY": 4878.0, "series": [{"data": [[1.549608E12, 4878.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.549608E12, 157.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.549608E12, 3709.8999999999996]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.549608E12, 4357.7300000000005]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.549608E12, 3949.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 2397.5, "minX": 16.0, "maxY": 2397.5, "series": [{"data": [[16.0, 2397.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 2397.5, "minX": 16.0, "maxY": 2397.5, "series": [{"data": [[16.0, 2397.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 16.666666666666668, "minX": 1.549608E12, "maxY": 16.666666666666668, "series": [{"data": [[1.549608E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 16.666666666666668, "minX": 1.549608E12, "maxY": 16.666666666666668, "series": [{"data": [[1.549608E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.549608E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 16.666666666666668, "minX": 1.549608E12, "maxY": 16.666666666666668, "series": [{"data": [[1.549608E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.549608E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
