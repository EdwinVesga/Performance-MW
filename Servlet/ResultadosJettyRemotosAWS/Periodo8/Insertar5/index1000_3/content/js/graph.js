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
        data: {"result": {"minY": 165.0, "minX": 0.0, "maxY": 4921.0, "series": [{"data": [[0.0, 165.0], [0.1, 177.0], [0.2, 177.0], [0.3, 177.0], [0.4, 193.0], [0.5, 194.0], [0.6, 196.0], [0.7, 197.0], [0.8, 198.0], [0.9, 199.0], [1.0, 202.0], [1.1, 205.0], [1.2, 207.0], [1.3, 207.0], [1.4, 207.0], [1.5, 208.0], [1.6, 212.0], [1.7, 212.0], [1.8, 216.0], [1.9, 216.0], [2.0, 217.0], [2.1, 217.0], [2.2, 221.0], [2.3, 221.0], [2.4, 221.0], [2.5, 223.0], [2.6, 223.0], [2.7, 226.0], [2.8, 226.0], [2.9, 232.0], [3.0, 234.0], [3.1, 237.0], [3.2, 238.0], [3.3, 238.0], [3.4, 238.0], [3.5, 241.0], [3.6, 242.0], [3.7, 243.0], [3.8, 244.0], [3.9, 246.0], [4.0, 247.0], [4.1, 249.0], [4.2, 253.0], [4.3, 254.0], [4.4, 257.0], [4.5, 260.0], [4.6, 261.0], [4.7, 263.0], [4.8, 264.0], [4.9, 264.0], [5.0, 264.0], [5.1, 268.0], [5.2, 269.0], [5.3, 272.0], [5.4, 275.0], [5.5, 276.0], [5.6, 276.0], [5.7, 279.0], [5.8, 281.0], [5.9, 283.0], [6.0, 284.0], [6.1, 285.0], [6.2, 287.0], [6.3, 288.0], [6.4, 289.0], [6.5, 290.0], [6.6, 293.0], [6.7, 299.0], [6.8, 299.0], [6.9, 300.0], [7.0, 301.0], [7.1, 302.0], [7.2, 307.0], [7.3, 308.0], [7.4, 309.0], [7.5, 309.0], [7.6, 311.0], [7.7, 321.0], [7.8, 326.0], [7.9, 339.0], [8.0, 344.0], [8.1, 348.0], [8.2, 354.0], [8.3, 357.0], [8.4, 377.0], [8.5, 377.0], [8.6, 421.0], [8.7, 590.0], [8.8, 809.0], [8.9, 830.0], [9.0, 830.0], [9.1, 854.0], [9.2, 875.0], [9.3, 877.0], [9.4, 879.0], [9.5, 885.0], [9.6, 903.0], [9.7, 924.0], [9.8, 963.0], [9.9, 967.0], [10.0, 972.0], [10.1, 987.0], [10.2, 999.0], [10.3, 1007.0], [10.4, 1009.0], [10.5, 1035.0], [10.6, 1039.0], [10.7, 1062.0], [10.8, 1072.0], [10.9, 1093.0], [11.0, 1121.0], [11.1, 1124.0], [11.2, 1127.0], [11.3, 1133.0], [11.4, 1133.0], [11.5, 1134.0], [11.6, 1138.0], [11.7, 1144.0], [11.8, 1145.0], [11.9, 1146.0], [12.0, 1147.0], [12.1, 1152.0], [12.2, 1172.0], [12.3, 1190.0], [12.4, 1204.0], [12.5, 1207.0], [12.6, 1209.0], [12.7, 1217.0], [12.8, 1225.0], [12.9, 1228.0], [13.0, 1253.0], [13.1, 1264.0], [13.2, 1266.0], [13.3, 1269.0], [13.4, 1279.0], [13.5, 1282.0], [13.6, 1284.0], [13.7, 1288.0], [13.8, 1291.0], [13.9, 1293.0], [14.0, 1310.0], [14.1, 1312.0], [14.2, 1315.0], [14.3, 1324.0], [14.4, 1330.0], [14.5, 1338.0], [14.6, 1340.0], [14.7, 1343.0], [14.8, 1346.0], [14.9, 1346.0], [15.0, 1350.0], [15.1, 1357.0], [15.2, 1362.0], [15.3, 1364.0], [15.4, 1365.0], [15.5, 1368.0], [15.6, 1376.0], [15.7, 1381.0], [15.8, 1389.0], [15.9, 1389.0], [16.0, 1394.0], [16.1, 1395.0], [16.2, 1410.0], [16.3, 1412.0], [16.4, 1413.0], [16.5, 1414.0], [16.6, 1415.0], [16.7, 1416.0], [16.8, 1420.0], [16.9, 1420.0], [17.0, 1426.0], [17.1, 1429.0], [17.2, 1439.0], [17.3, 1445.0], [17.4, 1457.0], [17.5, 1457.0], [17.6, 1460.0], [17.7, 1462.0], [17.8, 1466.0], [17.9, 1472.0], [18.0, 1482.0], [18.1, 1485.0], [18.2, 1486.0], [18.3, 1509.0], [18.4, 1513.0], [18.5, 1523.0], [18.6, 1530.0], [18.7, 1532.0], [18.8, 1535.0], [18.9, 1543.0], [19.0, 1543.0], [19.1, 1547.0], [19.2, 1549.0], [19.3, 1550.0], [19.4, 1557.0], [19.5, 1559.0], [19.6, 1564.0], [19.7, 1564.0], [19.8, 1568.0], [19.9, 1568.0], [20.0, 1575.0], [20.1, 1580.0], [20.2, 1581.0], [20.3, 1591.0], [20.4, 1605.0], [20.5, 1605.0], [20.6, 1607.0], [20.7, 1617.0], [20.8, 1622.0], [20.9, 1625.0], [21.0, 1626.0], [21.1, 1633.0], [21.2, 1641.0], [21.3, 1641.0], [21.4, 1647.0], [21.5, 1653.0], [21.6, 1653.0], [21.7, 1660.0], [21.8, 1668.0], [21.9, 1669.0], [22.0, 1669.0], [22.1, 1671.0], [22.2, 1674.0], [22.3, 1684.0], [22.4, 1684.0], [22.5, 1686.0], [22.6, 1690.0], [22.7, 1690.0], [22.8, 1693.0], [22.9, 1694.0], [23.0, 1694.0], [23.1, 1694.0], [23.2, 1697.0], [23.3, 1699.0], [23.4, 1700.0], [23.5, 1703.0], [23.6, 1705.0], [23.7, 1706.0], [23.8, 1710.0], [23.9, 1712.0], [24.0, 1712.0], [24.1, 1718.0], [24.2, 1721.0], [24.3, 1744.0], [24.4, 1747.0], [24.5, 1754.0], [24.6, 1756.0], [24.7, 1756.0], [24.8, 1757.0], [24.9, 1761.0], [25.0, 1762.0], [25.1, 1769.0], [25.2, 1774.0], [25.3, 1776.0], [25.4, 1780.0], [25.5, 1781.0], [25.6, 1784.0], [25.7, 1787.0], [25.8, 1788.0], [25.9, 1788.0], [26.0, 1792.0], [26.1, 1792.0], [26.2, 1794.0], [26.3, 1799.0], [26.4, 1799.0], [26.5, 1802.0], [26.6, 1804.0], [26.7, 1806.0], [26.8, 1810.0], [26.9, 1810.0], [27.0, 1813.0], [27.1, 1819.0], [27.2, 1833.0], [27.3, 1834.0], [27.4, 1835.0], [27.5, 1837.0], [27.6, 1845.0], [27.7, 1845.0], [27.8, 1847.0], [27.9, 1853.0], [28.0, 1854.0], [28.1, 1859.0], [28.2, 1864.0], [28.3, 1865.0], [28.4, 1867.0], [28.5, 1871.0], [28.6, 1872.0], [28.7, 1877.0], [28.8, 1877.0], [28.9, 1878.0], [29.0, 1880.0], [29.1, 1881.0], [29.2, 1885.0], [29.3, 1890.0], [29.4, 1892.0], [29.5, 1893.0], [29.6, 1894.0], [29.7, 1894.0], [29.8, 1897.0], [29.9, 1904.0], [30.0, 1905.0], [30.1, 1907.0], [30.2, 1907.0], [30.3, 1911.0], [30.4, 1914.0], [30.5, 1916.0], [30.6, 1923.0], [30.7, 1927.0], [30.8, 1929.0], [30.9, 1930.0], [31.0, 1931.0], [31.1, 1933.0], [31.2, 1934.0], [31.3, 1937.0], [31.4, 1939.0], [31.5, 1947.0], [31.6, 1954.0], [31.7, 1960.0], [31.8, 1961.0], [31.9, 1962.0], [32.0, 1964.0], [32.1, 1964.0], [32.2, 1969.0], [32.3, 1969.0], [32.4, 1970.0], [32.5, 1975.0], [32.6, 1975.0], [32.7, 1985.0], [32.8, 1986.0], [32.9, 1987.0], [33.0, 1989.0], [33.1, 1990.0], [33.2, 1991.0], [33.3, 1995.0], [33.4, 1998.0], [33.5, 1998.0], [33.6, 2001.0], [33.7, 2005.0], [33.8, 2006.0], [33.9, 2018.0], [34.0, 2018.0], [34.1, 2021.0], [34.2, 2023.0], [34.3, 2031.0], [34.4, 2033.0], [34.5, 2035.0], [34.6, 2035.0], [34.7, 2035.0], [34.8, 2036.0], [34.9, 2044.0], [35.0, 2046.0], [35.1, 2048.0], [35.2, 2053.0], [35.3, 2055.0], [35.4, 2056.0], [35.5, 2066.0], [35.6, 2067.0], [35.7, 2067.0], [35.8, 2070.0], [35.9, 2075.0], [36.0, 2079.0], [36.1, 2083.0], [36.2, 2085.0], [36.3, 2085.0], [36.4, 2086.0], [36.5, 2092.0], [36.6, 2092.0], [36.7, 2094.0], [36.8, 2099.0], [36.9, 2099.0], [37.0, 2104.0], [37.1, 2107.0], [37.2, 2108.0], [37.3, 2111.0], [37.4, 2112.0], [37.5, 2121.0], [37.6, 2122.0], [37.7, 2122.0], [37.8, 2125.0], [37.9, 2133.0], [38.0, 2141.0], [38.1, 2145.0], [38.2, 2150.0], [38.3, 2153.0], [38.4, 2159.0], [38.5, 2163.0], [38.6, 2166.0], [38.7, 2167.0], [38.8, 2170.0], [38.9, 2182.0], [39.0, 2192.0], [39.1, 2193.0], [39.2, 2197.0], [39.3, 2200.0], [39.4, 2209.0], [39.5, 2211.0], [39.6, 2212.0], [39.7, 2213.0], [39.8, 2214.0], [39.9, 2218.0], [40.0, 2224.0], [40.1, 2227.0], [40.2, 2228.0], [40.3, 2231.0], [40.4, 2231.0], [40.5, 2234.0], [40.6, 2239.0], [40.7, 2239.0], [40.8, 2240.0], [40.9, 2242.0], [41.0, 2245.0], [41.1, 2247.0], [41.2, 2248.0], [41.3, 2251.0], [41.4, 2253.0], [41.5, 2254.0], [41.6, 2258.0], [41.7, 2262.0], [41.8, 2263.0], [41.9, 2263.0], [42.0, 2265.0], [42.1, 2274.0], [42.2, 2275.0], [42.3, 2283.0], [42.4, 2284.0], [42.5, 2286.0], [42.6, 2292.0], [42.7, 2295.0], [42.8, 2297.0], [42.9, 2299.0], [43.0, 2302.0], [43.1, 2314.0], [43.2, 2316.0], [43.3, 2321.0], [43.4, 2330.0], [43.5, 2332.0], [43.6, 2334.0], [43.7, 2341.0], [43.8, 2342.0], [43.9, 2345.0], [44.0, 2348.0], [44.1, 2349.0], [44.2, 2350.0], [44.3, 2350.0], [44.4, 2352.0], [44.5, 2353.0], [44.6, 2353.0], [44.7, 2360.0], [44.8, 2361.0], [44.9, 2363.0], [45.0, 2368.0], [45.1, 2370.0], [45.2, 2376.0], [45.3, 2376.0], [45.4, 2381.0], [45.5, 2384.0], [45.6, 2386.0], [45.7, 2393.0], [45.8, 2400.0], [45.9, 2401.0], [46.0, 2403.0], [46.1, 2405.0], [46.2, 2406.0], [46.3, 2409.0], [46.4, 2412.0], [46.5, 2412.0], [46.6, 2412.0], [46.7, 2414.0], [46.8, 2415.0], [46.9, 2417.0], [47.0, 2422.0], [47.1, 2423.0], [47.2, 2426.0], [47.3, 2428.0], [47.4, 2430.0], [47.5, 2431.0], [47.6, 2433.0], [47.7, 2439.0], [47.8, 2441.0], [47.9, 2445.0], [48.0, 2447.0], [48.1, 2451.0], [48.2, 2468.0], [48.3, 2477.0], [48.4, 2479.0], [48.5, 2479.0], [48.6, 2485.0], [48.7, 2487.0], [48.8, 2488.0], [48.9, 2492.0], [49.0, 2493.0], [49.1, 2498.0], [49.2, 2503.0], [49.3, 2510.0], [49.4, 2511.0], [49.5, 2512.0], [49.6, 2517.0], [49.7, 2524.0], [49.8, 2525.0], [49.9, 2526.0], [50.0, 2527.0], [50.1, 2529.0], [50.2, 2532.0], [50.3, 2533.0], [50.4, 2535.0], [50.5, 2540.0], [50.6, 2549.0], [50.7, 2550.0], [50.8, 2555.0], [50.9, 2556.0], [51.0, 2566.0], [51.1, 2566.0], [51.2, 2567.0], [51.3, 2568.0], [51.4, 2568.0], [51.5, 2569.0], [51.6, 2571.0], [51.7, 2573.0], [51.8, 2577.0], [51.9, 2580.0], [52.0, 2583.0], [52.1, 2588.0], [52.2, 2589.0], [52.3, 2589.0], [52.4, 2591.0], [52.5, 2593.0], [52.6, 2595.0], [52.7, 2596.0], [52.8, 2596.0], [52.9, 2600.0], [53.0, 2600.0], [53.1, 2600.0], [53.2, 2608.0], [53.3, 2608.0], [53.4, 2608.0], [53.5, 2609.0], [53.6, 2614.0], [53.7, 2614.0], [53.8, 2614.0], [53.9, 2619.0], [54.0, 2621.0], [54.1, 2624.0], [54.2, 2626.0], [54.3, 2628.0], [54.4, 2628.0], [54.5, 2633.0], [54.6, 2633.0], [54.7, 2634.0], [54.8, 2636.0], [54.9, 2637.0], [55.0, 2644.0], [55.1, 2646.0], [55.2, 2647.0], [55.3, 2647.0], [55.4, 2650.0], [55.5, 2662.0], [55.6, 2665.0], [55.7, 2665.0], [55.8, 2668.0], [55.9, 2669.0], [56.0, 2676.0], [56.1, 2676.0], [56.2, 2676.0], [56.3, 2678.0], [56.4, 2684.0], [56.5, 2689.0], [56.6, 2691.0], [56.7, 2692.0], [56.8, 2693.0], [56.9, 2696.0], [57.0, 2696.0], [57.1, 2698.0], [57.2, 2698.0], [57.3, 2702.0], [57.4, 2703.0], [57.5, 2703.0], [57.6, 2705.0], [57.7, 2713.0], [57.8, 2713.0], [57.9, 2713.0], [58.0, 2714.0], [58.1, 2715.0], [58.2, 2716.0], [58.3, 2716.0], [58.4, 2717.0], [58.5, 2718.0], [58.6, 2725.0], [58.7, 2728.0], [58.8, 2734.0], [58.9, 2739.0], [59.0, 2739.0], [59.1, 2745.0], [59.2, 2756.0], [59.3, 2757.0], [59.4, 2760.0], [59.5, 2762.0], [59.6, 2774.0], [59.7, 2776.0], [59.8, 2778.0], [59.9, 2778.0], [60.0, 2778.0], [60.1, 2788.0], [60.2, 2789.0], [60.3, 2798.0], [60.4, 2802.0], [60.5, 2803.0], [60.6, 2806.0], [60.7, 2809.0], [60.8, 2813.0], [60.9, 2815.0], [61.0, 2819.0], [61.1, 2821.0], [61.2, 2821.0], [61.3, 2823.0], [61.4, 2824.0], [61.5, 2825.0], [61.6, 2833.0], [61.7, 2834.0], [61.8, 2835.0], [61.9, 2837.0], [62.0, 2840.0], [62.1, 2841.0], [62.2, 2841.0], [62.3, 2843.0], [62.4, 2849.0], [62.5, 2850.0], [62.6, 2852.0], [62.7, 2854.0], [62.8, 2856.0], [62.9, 2857.0], [63.0, 2867.0], [63.1, 2870.0], [63.2, 2872.0], [63.3, 2875.0], [63.4, 2883.0], [63.5, 2886.0], [63.6, 2897.0], [63.7, 2901.0], [63.8, 2902.0], [63.9, 2906.0], [64.0, 2906.0], [64.1, 2908.0], [64.2, 2908.0], [64.3, 2910.0], [64.4, 2910.0], [64.5, 2912.0], [64.6, 2922.0], [64.7, 2925.0], [64.8, 2929.0], [64.9, 2930.0], [65.0, 2933.0], [65.1, 2941.0], [65.2, 2948.0], [65.3, 2954.0], [65.4, 2957.0], [65.5, 2960.0], [65.6, 2962.0], [65.7, 2965.0], [65.8, 2968.0], [65.9, 2973.0], [66.0, 2974.0], [66.1, 2978.0], [66.2, 2980.0], [66.3, 2985.0], [66.4, 2990.0], [66.5, 2991.0], [66.6, 2996.0], [66.7, 2997.0], [66.8, 3000.0], [66.9, 3004.0], [67.0, 3011.0], [67.1, 3011.0], [67.2, 3015.0], [67.3, 3016.0], [67.4, 3022.0], [67.5, 3024.0], [67.6, 3029.0], [67.7, 3033.0], [67.8, 3034.0], [67.9, 3038.0], [68.0, 3040.0], [68.1, 3041.0], [68.2, 3043.0], [68.3, 3048.0], [68.4, 3048.0], [68.5, 3054.0], [68.6, 3061.0], [68.7, 3062.0], [68.8, 3065.0], [68.9, 3066.0], [69.0, 3072.0], [69.1, 3073.0], [69.2, 3076.0], [69.3, 3076.0], [69.4, 3081.0], [69.5, 3084.0], [69.6, 3086.0], [69.7, 3093.0], [69.8, 3096.0], [69.9, 3099.0], [70.0, 3110.0], [70.1, 3117.0], [70.2, 3122.0], [70.3, 3126.0], [70.4, 3126.0], [70.5, 3127.0], [70.6, 3129.0], [70.7, 3132.0], [70.8, 3134.0], [70.9, 3135.0], [71.0, 3135.0], [71.1, 3139.0], [71.2, 3142.0], [71.3, 3145.0], [71.4, 3149.0], [71.5, 3150.0], [71.6, 3152.0], [71.7, 3154.0], [71.8, 3165.0], [71.9, 3166.0], [72.0, 3172.0], [72.1, 3173.0], [72.2, 3177.0], [72.3, 3181.0], [72.4, 3181.0], [72.5, 3183.0], [72.6, 3187.0], [72.7, 3189.0], [72.8, 3193.0], [72.9, 3194.0], [73.0, 3199.0], [73.1, 3204.0], [73.2, 3204.0], [73.3, 3206.0], [73.4, 3208.0], [73.5, 3211.0], [73.6, 3212.0], [73.7, 3224.0], [73.8, 3225.0], [73.9, 3226.0], [74.0, 3233.0], [74.1, 3241.0], [74.2, 3242.0], [74.3, 3245.0], [74.4, 3254.0], [74.5, 3255.0], [74.6, 3261.0], [74.7, 3262.0], [74.8, 3263.0], [74.9, 3263.0], [75.0, 3263.0], [75.1, 3264.0], [75.2, 3267.0], [75.3, 3267.0], [75.4, 3267.0], [75.5, 3268.0], [75.6, 3272.0], [75.7, 3276.0], [75.8, 3280.0], [75.9, 3285.0], [76.0, 3285.0], [76.1, 3293.0], [76.2, 3293.0], [76.3, 3294.0], [76.4, 3295.0], [76.5, 3296.0], [76.6, 3296.0], [76.7, 3301.0], [76.8, 3303.0], [76.9, 3316.0], [77.0, 3319.0], [77.1, 3321.0], [77.2, 3329.0], [77.3, 3329.0], [77.4, 3330.0], [77.5, 3331.0], [77.6, 3342.0], [77.7, 3344.0], [77.8, 3348.0], [77.9, 3355.0], [78.0, 3358.0], [78.1, 3358.0], [78.2, 3360.0], [78.3, 3361.0], [78.4, 3364.0], [78.5, 3369.0], [78.6, 3372.0], [78.7, 3373.0], [78.8, 3376.0], [78.9, 3382.0], [79.0, 3386.0], [79.1, 3399.0], [79.2, 3402.0], [79.3, 3402.0], [79.4, 3405.0], [79.5, 3407.0], [79.6, 3408.0], [79.7, 3418.0], [79.8, 3420.0], [79.9, 3421.0], [80.0, 3422.0], [80.1, 3422.0], [80.2, 3422.0], [80.3, 3426.0], [80.4, 3427.0], [80.5, 3435.0], [80.6, 3436.0], [80.7, 3439.0], [80.8, 3439.0], [80.9, 3442.0], [81.0, 3462.0], [81.1, 3465.0], [81.2, 3469.0], [81.3, 3470.0], [81.4, 3473.0], [81.5, 3474.0], [81.6, 3477.0], [81.7, 3478.0], [81.8, 3482.0], [81.9, 3483.0], [82.0, 3484.0], [82.1, 3486.0], [82.2, 3487.0], [82.3, 3487.0], [82.4, 3489.0], [82.5, 3491.0], [82.6, 3493.0], [82.7, 3501.0], [82.8, 3503.0], [82.9, 3504.0], [83.0, 3505.0], [83.1, 3506.0], [83.2, 3510.0], [83.3, 3510.0], [83.4, 3516.0], [83.5, 3517.0], [83.6, 3519.0], [83.7, 3520.0], [83.8, 3521.0], [83.9, 3521.0], [84.0, 3526.0], [84.1, 3531.0], [84.2, 3533.0], [84.3, 3535.0], [84.4, 3543.0], [84.5, 3543.0], [84.6, 3546.0], [84.7, 3547.0], [84.8, 3552.0], [84.9, 3558.0], [85.0, 3561.0], [85.1, 3561.0], [85.2, 3565.0], [85.3, 3566.0], [85.4, 3566.0], [85.5, 3568.0], [85.6, 3568.0], [85.7, 3574.0], [85.8, 3575.0], [85.9, 3575.0], [86.0, 3579.0], [86.1, 3585.0], [86.2, 3585.0], [86.3, 3588.0], [86.4, 3593.0], [86.5, 3600.0], [86.6, 3604.0], [86.7, 3616.0], [86.8, 3616.0], [86.9, 3618.0], [87.0, 3619.0], [87.1, 3628.0], [87.2, 3639.0], [87.3, 3642.0], [87.4, 3649.0], [87.5, 3650.0], [87.6, 3650.0], [87.7, 3653.0], [87.8, 3653.0], [87.9, 3659.0], [88.0, 3663.0], [88.1, 3668.0], [88.2, 3670.0], [88.3, 3671.0], [88.4, 3678.0], [88.5, 3683.0], [88.6, 3686.0], [88.7, 3691.0], [88.8, 3691.0], [88.9, 3694.0], [89.0, 3694.0], [89.1, 3694.0], [89.2, 3696.0], [89.3, 3698.0], [89.4, 3700.0], [89.5, 3703.0], [89.6, 3704.0], [89.7, 3704.0], [89.8, 3707.0], [89.9, 3709.0], [90.0, 3710.0], [90.1, 3711.0], [90.2, 3717.0], [90.3, 3719.0], [90.4, 3722.0], [90.5, 3723.0], [90.6, 3725.0], [90.7, 3726.0], [90.8, 3737.0], [90.9, 3740.0], [91.0, 3741.0], [91.1, 3763.0], [91.2, 3766.0], [91.3, 3766.0], [91.4, 3767.0], [91.5, 3772.0], [91.6, 3776.0], [91.7, 3789.0], [91.8, 3793.0], [91.9, 3797.0], [92.0, 3809.0], [92.1, 3820.0], [92.2, 3827.0], [92.3, 3832.0], [92.4, 3838.0], [92.5, 3852.0], [92.6, 3854.0], [92.7, 3859.0], [92.8, 3859.0], [92.9, 3868.0], [93.0, 3879.0], [93.1, 3885.0], [93.2, 3887.0], [93.3, 3888.0], [93.4, 3893.0], [93.5, 3895.0], [93.6, 3897.0], [93.7, 3900.0], [93.8, 3900.0], [93.9, 3914.0], [94.0, 3928.0], [94.1, 3942.0], [94.2, 3958.0], [94.3, 3965.0], [94.4, 3993.0], [94.5, 3999.0], [94.6, 4005.0], [94.7, 4012.0], [94.8, 4014.0], [94.9, 4022.0], [95.0, 4033.0], [95.1, 4035.0], [95.2, 4048.0], [95.3, 4052.0], [95.4, 4063.0], [95.5, 4083.0], [95.6, 4084.0], [95.7, 4086.0], [95.8, 4093.0], [95.9, 4100.0], [96.0, 4116.0], [96.1, 4122.0], [96.2, 4137.0], [96.3, 4142.0], [96.4, 4143.0], [96.5, 4153.0], [96.6, 4159.0], [96.7, 4161.0], [96.8, 4172.0], [96.9, 4189.0], [97.0, 4198.0], [97.1, 4207.0], [97.2, 4216.0], [97.3, 4221.0], [97.4, 4236.0], [97.5, 4248.0], [97.6, 4249.0], [97.7, 4251.0], [97.8, 4280.0], [97.9, 4305.0], [98.0, 4308.0], [98.1, 4311.0], [98.2, 4328.0], [98.3, 4405.0], [98.4, 4406.0], [98.5, 4409.0], [98.6, 4412.0], [98.7, 4416.0], [98.8, 4419.0], [98.9, 4422.0], [99.0, 4436.0], [99.1, 4440.0], [99.2, 4453.0], [99.3, 4453.0], [99.4, 4454.0], [99.5, 4515.0], [99.6, 4555.0], [99.7, 4563.0], [99.8, 4633.0], [99.9, 4921.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 100.0, "maxY": 59.0, "series": [{"data": [[800.0, 8.0], [900.0, 7.0], [1000.0, 7.0], [1100.0, 14.0], [1200.0, 16.0], [1300.0, 22.0], [1400.0, 21.0], [1500.0, 20.0], [100.0, 10.0], [1600.0, 30.0], [1700.0, 31.0], [1800.0, 34.0], [1900.0, 37.0], [2000.0, 34.0], [2100.0, 23.0], [2200.0, 37.0], [2300.0, 28.0], [2400.0, 34.0], [2500.0, 37.0], [2600.0, 44.0], [2700.0, 31.0], [2800.0, 33.0], [2900.0, 31.0], [3000.0, 32.0], [3100.0, 31.0], [200.0, 59.0], [3200.0, 37.0], [3300.0, 25.0], [3400.0, 35.0], [3500.0, 38.0], [3700.0, 26.0], [3600.0, 29.0], [3800.0, 17.0], [3900.0, 9.0], [4000.0, 13.0], [4100.0, 12.0], [4200.0, 8.0], [4300.0, 4.0], [4400.0, 12.0], [4600.0, 1.0], [4500.0, 3.0], [300.0, 17.0], [4900.0, 1.0], [400.0, 1.0], [500.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 4900.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 87.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 817.0, "series": [{"data": [[1.0, 96.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 87.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 817.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 214.27899999999997, "minX": 1.54960836E12, "maxY": 214.27899999999997, "series": [{"data": [[1.54960836E12, 214.27899999999997]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960836E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 287.3333333333333, "minX": 1.0, "maxY": 4633.0, "series": [{"data": [[3.0, 2790.0], [4.0, 3062.0], [6.0, 3011.0], [7.0, 2821.0], [8.0, 2493.0], [9.0, 3096.0], [11.0, 2681.5], [12.0, 3024.0], [13.0, 2901.0], [14.0, 3016.0], [15.0, 2990.0], [16.0, 3081.0], [17.0, 2403.0], [18.0, 3073.0], [19.0, 3177.0], [20.0, 2156.0], [21.0, 488.0], [22.0, 372.875], [23.0, 450.64285714285717], [24.0, 523.75], [25.0, 773.2], [26.0, 3086.0], [27.0, 287.3333333333333], [28.0, 1445.25], [29.0, 698.3333333333334], [30.0, 954.2], [31.0, 299.5], [33.0, 1042.0], [32.0, 953.5555555555555], [35.0, 1466.0], [34.0, 1550.5], [37.0, 907.0], [36.0, 1658.0], [39.0, 1575.0], [38.0, 1839.5], [40.0, 1596.5], [41.0, 2488.0], [43.0, 2573.0], [42.0, 2703.0], [45.0, 2925.0], [44.0, 2668.0], [47.0, 2368.0], [46.0, 3439.0], [49.0, 2725.0], [48.0, 3628.0], [51.0, 2985.0], [50.0, 3263.0], [53.0, 2976.5], [55.0, 3852.0], [54.0, 3619.0], [57.0, 2634.0], [56.0, 2492.0], [59.0, 3048.0], [58.0, 4453.0], [61.0, 2472.5], [63.0, 2840.0], [62.0, 3470.0], [67.0, 3154.0], [66.0, 3352.5], [64.0, 2370.0], [71.0, 2934.0], [69.0, 3255.0], [68.0, 2702.0], [75.0, 3204.0], [74.0, 2886.0], [73.0, 3373.0], [72.0, 2835.0], [79.0, 2600.0], [78.0, 2691.0], [77.0, 2350.0], [76.0, 3686.0], [83.0, 2376.0], [82.0, 3296.0], [81.0, 3616.0], [80.0, 2716.0], [87.0, 3719.0], [86.0, 3493.0], [85.0, 3859.0], [84.0, 3405.0], [91.0, 2600.0], [90.0, 2715.0], [89.0, 3199.0], [88.0, 3421.0], [95.0, 4406.0], [94.0, 2991.0], [93.0, 3139.0], [92.0, 3653.0], [98.0, 2135.5], [99.0, 2085.5], [97.0, 3439.0], [96.0, 3267.0], [100.0, 1657.6666666666665], [101.0, 1574.0], [103.0, 2647.0], [102.0, 2332.0], [106.0, 1975.5], [107.0, 2774.0], [105.0, 3478.0], [104.0, 2973.0], [110.0, 2131.5], [111.0, 3211.0], [109.0, 3885.0], [108.0, 2228.0], [115.0, 3579.0], [114.0, 3194.0], [113.0, 3263.0], [112.0, 3473.0], [119.0, 2908.0], [118.0, 3897.0], [117.0, 2739.0], [116.0, 2556.0], [121.0, 2019.5], [120.0, 2433.0], [123.0, 3084.0], [122.0, 3426.0], [126.0, 4022.0], [125.0, 3653.0], [124.0, 3129.0], [133.0, 2307.5], [135.0, 1675.5], [134.0, 2941.0], [132.0, 2479.0], [131.0, 2349.0], [130.0, 2948.0], [129.0, 3767.0], [128.0, 2834.5], [138.0, 2802.5], [139.0, 2200.5], [141.0, 1951.0], [143.0, 2906.0], [142.0, 3671.0], [140.0, 3668.0], [137.0, 2593.0], [136.0, 2406.0], [151.0, 4083.0], [150.0, 2485.0], [149.0, 4236.0], [148.0, 3503.0], [147.0, 2141.0], [146.0, 2778.0], [145.0, 3242.0], [144.0, 2341.0], [153.0, 2311.0], [156.0, 1960.5], [158.0, 1940.6666666666665], [157.0, 2843.0], [155.0, 3505.0], [154.0, 3226.0], [152.0, 3763.0], [162.0, 2901.3333333333335], [167.0, 3717.0], [166.0, 4308.0], [165.0, 3181.0], [164.0, 2242.0], [163.0, 3301.0], [160.0, 3490.5], [168.0, 1821.5], [172.0, 1848.0], [174.0, 1473.6666666666667], [173.0, 2073.5], [175.0, 1925.0], [171.0, 3575.0], [170.0, 2414.0], [169.0, 2033.0], [176.0, 2539.0], [179.0, 1428.8333333333335], [178.0, 1333.0], [177.0, 1813.5], [180.0, 1537.75], [181.0, 1782.125], [182.0, 1805.2857142857142], [183.0, 1752.5], [185.0, 1752.5714285714284], [184.0, 2093.5], [188.0, 1950.4], [187.0, 1847.75], [186.0, 1920.5], [189.0, 2396.0], [191.0, 1886.3333333333333], [190.0, 3263.0], [192.0, 1740.4285714285716], [194.0, 1248.0], [193.0, 2010.4], [196.0, 2108.6666666666665], [198.0, 1971.0], [197.0, 2368.5], [199.0, 2372.0], [195.0, 3438.0], [204.0, 2755.0], [203.0, 2190.3333333333335], [205.0, 2318.0], [206.0, 2641.5], [207.0, 2355.5], [202.0, 2567.0], [201.0, 2756.0], [200.0, 3659.0], [208.0, 2214.5], [209.0, 1680.8333333333333], [212.0, 2014.25], [211.0, 2144.6], [210.0, 1667.6666666666667], [215.0, 2023.0], [214.0, 3483.0], [213.0, 4116.0], [216.0, 2364.5], [217.0, 2682.0], [218.0, 2120.142857142857], [219.0, 2165.75], [221.0, 2128.833333333333], [220.0, 2378.0], [222.0, 2776.0], [223.0, 2313.5], [225.0, 2112.3333333333335], [226.0, 2732.5], [229.0, 2095.4], [228.0, 2423.6666666666665], [227.0, 2544.5], [231.0, 2410.25], [230.0, 2323.0], [224.0, 3358.0], [233.0, 2840.5], [232.0, 2815.5], [235.0, 2180.5], [236.0, 2460.75], [237.0, 2168.4615384615386], [239.0, 2399.285714285714], [238.0, 2196.5], [234.0, 3189.0], [240.0, 2218.3333333333335], [244.0, 2130.4444444444443], [245.0, 2499.6666666666665], [243.0, 2430.166666666667], [246.0, 2197.909090909091], [247.0, 2287.333333333333], [242.0, 4563.0], [241.0, 3965.0], [248.0, 3149.6666666666665], [250.0, 2891.5], [249.0, 2700.6666666666665], [251.0, 2256.125], [252.0, 2378.222222222222], [253.0, 2454.6666666666665], [255.0, 2167.6], [254.0, 2378.5], [257.0, 2275.625], [256.0, 2892.0], [258.0, 1969.4285714285716], [259.0, 2783.1428571428573], [260.0, 2603.5], [263.0, 2194.3333333333335], [264.0, 3004.5], [271.0, 2377.285714285714], [268.0, 2823.5], [269.0, 3015.0], [270.0, 2367.0], [265.0, 2575.285714285714], [266.0, 2639.0], [267.0, 4422.0], [262.0, 2008.0], [261.0, 2387.4], [274.0, 3156.0], [272.0, 2726.2], [273.0, 3506.0], [275.0, 2833.0], [284.0, 3224.0], [285.0, 3283.5], [286.0, 2816.0], [287.0, 2655.6666666666665], [277.0, 2397.6666666666665], [276.0, 3181.3333333333335], [278.0, 3290.5], [279.0, 2618.3333333333335], [280.0, 2922.0], [281.0, 2463.0], [283.0, 3840.0], [301.0, 3280.0], [295.0, 3032.25], [288.0, 2256.6666666666665], [290.0, 4159.0], [289.0, 2713.0], [300.0, 3558.0], [291.0, 3546.0], [293.0, 2795.0], [294.0, 2556.1666666666665], [292.0, 2438.3333333333335], [298.0, 3152.3333333333335], [297.0, 4216.0], [296.0, 3694.0], [299.0, 2588.0], [303.0, 3794.5], [302.0, 4153.0], [316.0, 3211.4], [304.0, 2729.0], [305.0, 3410.0], [307.0, 3893.0], [306.0, 3766.0], [308.0, 2544.5], [309.0, 2482.0], [311.0, 3293.0], [310.0, 4409.0], [314.0, 2829.0], [313.0, 3294.5], [312.0, 2340.0], [317.0, 2588.2], [318.0, 2579.1428571428573], [319.0, 2750.285714285714], [315.0, 2841.5], [323.0, 2689.3333333333335], [320.0, 2967.0], [327.0, 3110.0], [326.0, 3517.0], [325.0, 3691.0], [324.0, 2996.0], [321.0, 2732.2222222222217], [322.0, 2905.25], [335.0, 3776.0], [329.0, 3709.0], [328.0, 3533.0], [334.0, 2833.0], [333.0, 2924.0], [331.0, 3887.0], [330.0, 3639.0], [350.0, 3061.0], [351.0, 3683.0], [349.0, 3420.0], [348.0, 2646.0], [347.0, 3465.0], [346.0, 3145.0], [345.0, 2762.0], [344.0, 3233.0], [343.0, 3484.0], [337.0, 3293.0], [336.0, 4416.0], [339.0, 4412.0], [338.0, 3245.0], [342.0, 3442.0], [341.0, 4633.0], [340.0, 4086.0], [366.0, 3436.0], [367.0, 4005.0], [365.0, 3521.0], [364.0, 3574.0], [363.0, 2908.0], [362.0, 3868.0], [361.0, 3364.0], [360.0, 4137.0], [359.0, 3054.0], [353.0, 3531.0], [352.0, 4063.0], [355.0, 3741.0], [354.0, 3737.0], [358.0, 4198.0], [357.0, 3319.0], [356.0, 3344.0], [382.0, 2870.0], [383.0, 2902.0], [381.0, 2962.0], [380.0, 3793.0], [379.0, 2974.0], [378.0, 3262.0], [377.0, 3642.0], [376.0, 2665.0], [375.0, 4012.0], [369.0, 3165.0], [368.0, 3487.0], [371.0, 2823.0], [370.0, 3330.0], [374.0, 3832.0], [373.0, 4440.0], [372.0, 3422.0], [398.0, 3128.3750000000005], [399.0, 3380.142857142857], [397.0, 3383.4], [396.0, 2845.0], [395.0, 3000.4], [394.0, 3425.0], [393.0, 3678.0], [392.0, 3566.0], [391.0, 3772.0], [385.0, 3711.0], [384.0, 2819.0], [387.0, 3183.0], [386.0, 2850.0], [390.0, 3710.0], [389.0, 4143.0], [388.0, 2245.0], [400.0, 3284.727272727273], [403.0, 3117.0], [402.0, 3377.0], [401.0, 3128.3333333333335], [1.0, 3033.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[214.27899999999997, 2432.320000000003]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 403.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 6250.0, "minX": 1.54960836E12, "maxY": 7015.85, "series": [{"data": [[1.54960836E12, 7015.85]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960836E12, 6250.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960836E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 2432.320000000003, "minX": 1.54960836E12, "maxY": 2432.320000000003, "series": [{"data": [[1.54960836E12, 2432.320000000003]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960836E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 2432.306000000002, "minX": 1.54960836E12, "maxY": 2432.306000000002, "series": [{"data": [[1.54960836E12, 2432.306000000002]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960836E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 46.95, "minX": 1.54960836E12, "maxY": 46.95, "series": [{"data": [[1.54960836E12, 46.95]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960836E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 165.0, "minX": 1.54960836E12, "maxY": 4921.0, "series": [{"data": [[1.54960836E12, 4921.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960836E12, 165.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960836E12, 3709.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960836E12, 4435.860000000001]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960836E12, 4032.4499999999994]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960836E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 2528.0, "minX": 16.0, "maxY": 2528.0, "series": [{"data": [[16.0, 2528.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 2528.0, "minX": 16.0, "maxY": 2528.0, "series": [{"data": [[16.0, 2528.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54960836E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54960836E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960836E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54960836E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54960836E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960836E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54960836E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54960836E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960836E12, "title": "Transactions Per Second"}},
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
