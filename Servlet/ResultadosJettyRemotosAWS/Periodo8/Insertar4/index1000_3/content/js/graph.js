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
        data: {"result": {"minY": 234.0, "minX": 0.0, "maxY": 5351.0, "series": [{"data": [[0.0, 234.0], [0.1, 240.0], [0.2, 255.0], [0.3, 255.0], [0.4, 267.0], [0.5, 274.0], [0.6, 284.0], [0.7, 287.0], [0.8, 287.0], [0.9, 288.0], [1.0, 299.0], [1.1, 299.0], [1.2, 299.0], [1.3, 318.0], [1.4, 319.0], [1.5, 319.0], [1.6, 322.0], [1.7, 323.0], [1.8, 324.0], [1.9, 324.0], [2.0, 334.0], [2.1, 351.0], [2.2, 351.0], [2.3, 351.0], [2.4, 352.0], [2.5, 352.0], [2.6, 354.0], [2.7, 356.0], [2.8, 362.0], [2.9, 370.0], [3.0, 375.0], [3.1, 381.0], [3.2, 389.0], [3.3, 392.0], [3.4, 394.0], [3.5, 405.0], [3.6, 413.0], [3.7, 422.0], [3.8, 682.0], [3.9, 705.0], [4.0, 762.0], [4.1, 781.0], [4.2, 860.0], [4.3, 927.0], [4.4, 950.0], [4.5, 956.0], [4.6, 960.0], [4.7, 963.0], [4.8, 984.0], [4.9, 984.0], [5.0, 991.0], [5.1, 1008.0], [5.2, 1014.0], [5.3, 1026.0], [5.4, 1033.0], [5.5, 1043.0], [5.6, 1050.0], [5.7, 1094.0], [5.8, 1115.0], [5.9, 1118.0], [6.0, 1126.0], [6.1, 1130.0], [6.2, 1135.0], [6.3, 1140.0], [6.4, 1144.0], [6.5, 1147.0], [6.6, 1151.0], [6.7, 1156.0], [6.8, 1163.0], [6.9, 1163.0], [7.0, 1166.0], [7.1, 1169.0], [7.2, 1171.0], [7.3, 1175.0], [7.4, 1177.0], [7.5, 1193.0], [7.6, 1207.0], [7.7, 1213.0], [7.8, 1216.0], [7.9, 1229.0], [8.0, 1231.0], [8.1, 1237.0], [8.2, 1248.0], [8.3, 1248.0], [8.4, 1253.0], [8.5, 1254.0], [8.6, 1255.0], [8.7, 1260.0], [8.8, 1274.0], [8.9, 1275.0], [9.0, 1278.0], [9.1, 1278.0], [9.2, 1293.0], [9.3, 1294.0], [9.4, 1305.0], [9.5, 1307.0], [9.6, 1309.0], [9.7, 1311.0], [9.8, 1314.0], [9.9, 1319.0], [10.0, 1330.0], [10.1, 1330.0], [10.2, 1331.0], [10.3, 1335.0], [10.4, 1353.0], [10.5, 1354.0], [10.6, 1358.0], [10.7, 1363.0], [10.8, 1372.0], [10.9, 1372.0], [11.0, 1373.0], [11.1, 1383.0], [11.2, 1392.0], [11.3, 1397.0], [11.4, 1399.0], [11.5, 1402.0], [11.6, 1403.0], [11.7, 1404.0], [11.8, 1405.0], [11.9, 1405.0], [12.0, 1406.0], [12.1, 1407.0], [12.2, 1408.0], [12.3, 1409.0], [12.4, 1411.0], [12.5, 1416.0], [12.6, 1416.0], [12.7, 1420.0], [12.8, 1424.0], [12.9, 1427.0], [13.0, 1428.0], [13.1, 1429.0], [13.2, 1433.0], [13.3, 1435.0], [13.4, 1438.0], [13.5, 1438.0], [13.6, 1443.0], [13.7, 1444.0], [13.8, 1445.0], [13.9, 1448.0], [14.0, 1456.0], [14.1, 1458.0], [14.2, 1458.0], [14.3, 1461.0], [14.4, 1463.0], [14.5, 1465.0], [14.6, 1465.0], [14.7, 1469.0], [14.8, 1471.0], [14.9, 1474.0], [15.0, 1492.0], [15.1, 1495.0], [15.2, 1499.0], [15.3, 1501.0], [15.4, 1502.0], [15.5, 1502.0], [15.6, 1505.0], [15.7, 1512.0], [15.8, 1519.0], [15.9, 1519.0], [16.0, 1520.0], [16.1, 1522.0], [16.2, 1528.0], [16.3, 1531.0], [16.4, 1531.0], [16.5, 1534.0], [16.6, 1549.0], [16.7, 1551.0], [16.8, 1554.0], [16.9, 1560.0], [17.0, 1565.0], [17.1, 1570.0], [17.2, 1570.0], [17.3, 1576.0], [17.4, 1576.0], [17.5, 1579.0], [17.6, 1582.0], [17.7, 1585.0], [17.8, 1586.0], [17.9, 1586.0], [18.0, 1590.0], [18.1, 1590.0], [18.2, 1596.0], [18.3, 1603.0], [18.4, 1604.0], [18.5, 1606.0], [18.6, 1614.0], [18.7, 1615.0], [18.8, 1618.0], [18.9, 1626.0], [19.0, 1627.0], [19.1, 1627.0], [19.2, 1628.0], [19.3, 1633.0], [19.4, 1635.0], [19.5, 1637.0], [19.6, 1640.0], [19.7, 1643.0], [19.8, 1644.0], [19.9, 1649.0], [20.0, 1651.0], [20.1, 1653.0], [20.2, 1657.0], [20.3, 1657.0], [20.4, 1659.0], [20.5, 1663.0], [20.6, 1665.0], [20.7, 1665.0], [20.8, 1668.0], [20.9, 1668.0], [21.0, 1670.0], [21.1, 1672.0], [21.2, 1672.0], [21.3, 1679.0], [21.4, 1681.0], [21.5, 1682.0], [21.6, 1684.0], [21.7, 1684.0], [21.8, 1685.0], [21.9, 1698.0], [22.0, 1700.0], [22.1, 1700.0], [22.2, 1707.0], [22.3, 1708.0], [22.4, 1712.0], [22.5, 1715.0], [22.6, 1717.0], [22.7, 1719.0], [22.8, 1719.0], [22.9, 1719.0], [23.0, 1720.0], [23.1, 1720.0], [23.2, 1722.0], [23.3, 1725.0], [23.4, 1725.0], [23.5, 1725.0], [23.6, 1726.0], [23.7, 1726.0], [23.8, 1727.0], [23.9, 1727.0], [24.0, 1732.0], [24.1, 1732.0], [24.2, 1734.0], [24.3, 1738.0], [24.4, 1742.0], [24.5, 1742.0], [24.6, 1743.0], [24.7, 1748.0], [24.8, 1753.0], [24.9, 1760.0], [25.0, 1763.0], [25.1, 1764.0], [25.2, 1764.0], [25.3, 1766.0], [25.4, 1771.0], [25.5, 1777.0], [25.6, 1777.0], [25.7, 1777.0], [25.8, 1777.0], [25.9, 1781.0], [26.0, 1789.0], [26.1, 1790.0], [26.2, 1790.0], [26.3, 1791.0], [26.4, 1793.0], [26.5, 1796.0], [26.6, 1802.0], [26.7, 1806.0], [26.8, 1807.0], [26.9, 1809.0], [27.0, 1810.0], [27.1, 1812.0], [27.2, 1815.0], [27.3, 1816.0], [27.4, 1825.0], [27.5, 1826.0], [27.6, 1826.0], [27.7, 1830.0], [27.8, 1833.0], [27.9, 1835.0], [28.0, 1839.0], [28.1, 1842.0], [28.2, 1843.0], [28.3, 1846.0], [28.4, 1846.0], [28.5, 1847.0], [28.6, 1849.0], [28.7, 1849.0], [28.8, 1849.0], [28.9, 1863.0], [29.0, 1863.0], [29.1, 1868.0], [29.2, 1868.0], [29.3, 1876.0], [29.4, 1887.0], [29.5, 1889.0], [29.6, 1889.0], [29.7, 1889.0], [29.8, 1891.0], [29.9, 1892.0], [30.0, 1893.0], [30.1, 1895.0], [30.2, 1898.0], [30.3, 1903.0], [30.4, 1907.0], [30.5, 1912.0], [30.6, 1912.0], [30.7, 1914.0], [30.8, 1918.0], [30.9, 1918.0], [31.0, 1919.0], [31.1, 1921.0], [31.2, 1922.0], [31.3, 1922.0], [31.4, 1923.0], [31.5, 1923.0], [31.6, 1927.0], [31.7, 1933.0], [31.8, 1935.0], [31.9, 1937.0], [32.0, 1943.0], [32.1, 1944.0], [32.2, 1948.0], [32.3, 1950.0], [32.4, 1951.0], [32.5, 1951.0], [32.6, 1954.0], [32.7, 1959.0], [32.8, 1959.0], [32.9, 1961.0], [33.0, 1961.0], [33.1, 1967.0], [33.2, 1967.0], [33.3, 1975.0], [33.4, 1975.0], [33.5, 1976.0], [33.6, 1977.0], [33.7, 1977.0], [33.8, 1982.0], [33.9, 1991.0], [34.0, 1991.0], [34.1, 1994.0], [34.2, 1994.0], [34.3, 1997.0], [34.4, 1998.0], [34.5, 2002.0], [34.6, 2003.0], [34.7, 2004.0], [34.8, 2007.0], [34.9, 2008.0], [35.0, 2012.0], [35.1, 2014.0], [35.2, 2016.0], [35.3, 2017.0], [35.4, 2017.0], [35.5, 2018.0], [35.6, 2024.0], [35.7, 2026.0], [35.8, 2028.0], [35.9, 2030.0], [36.0, 2032.0], [36.1, 2032.0], [36.2, 2036.0], [36.3, 2042.0], [36.4, 2047.0], [36.5, 2048.0], [36.6, 2051.0], [36.7, 2051.0], [36.8, 2054.0], [36.9, 2056.0], [37.0, 2060.0], [37.1, 2061.0], [37.2, 2062.0], [37.3, 2062.0], [37.4, 2068.0], [37.5, 2080.0], [37.6, 2084.0], [37.7, 2085.0], [37.8, 2087.0], [37.9, 2089.0], [38.0, 2094.0], [38.1, 2095.0], [38.2, 2095.0], [38.3, 2096.0], [38.4, 2098.0], [38.5, 2107.0], [38.6, 2110.0], [38.7, 2112.0], [38.8, 2115.0], [38.9, 2117.0], [39.0, 2119.0], [39.1, 2125.0], [39.2, 2132.0], [39.3, 2139.0], [39.4, 2141.0], [39.5, 2144.0], [39.6, 2148.0], [39.7, 2148.0], [39.8, 2151.0], [39.9, 2155.0], [40.0, 2159.0], [40.1, 2164.0], [40.2, 2171.0], [40.3, 2172.0], [40.4, 2173.0], [40.5, 2174.0], [40.6, 2182.0], [40.7, 2184.0], [40.8, 2184.0], [40.9, 2190.0], [41.0, 2193.0], [41.1, 2198.0], [41.2, 2204.0], [41.3, 2205.0], [41.4, 2206.0], [41.5, 2207.0], [41.6, 2214.0], [41.7, 2215.0], [41.8, 2215.0], [41.9, 2233.0], [42.0, 2234.0], [42.1, 2241.0], [42.2, 2247.0], [42.3, 2247.0], [42.4, 2254.0], [42.5, 2256.0], [42.6, 2257.0], [42.7, 2260.0], [42.8, 2262.0], [42.9, 2266.0], [43.0, 2266.0], [43.1, 2270.0], [43.2, 2271.0], [43.3, 2277.0], [43.4, 2280.0], [43.5, 2282.0], [43.6, 2286.0], [43.7, 2287.0], [43.8, 2290.0], [43.9, 2302.0], [44.0, 2317.0], [44.1, 2318.0], [44.2, 2321.0], [44.3, 2322.0], [44.4, 2327.0], [44.5, 2329.0], [44.6, 2332.0], [44.7, 2332.0], [44.8, 2333.0], [44.9, 2334.0], [45.0, 2346.0], [45.1, 2348.0], [45.2, 2349.0], [45.3, 2353.0], [45.4, 2354.0], [45.5, 2357.0], [45.6, 2366.0], [45.7, 2368.0], [45.8, 2370.0], [45.9, 2371.0], [46.0, 2372.0], [46.1, 2372.0], [46.2, 2373.0], [46.3, 2375.0], [46.4, 2378.0], [46.5, 2381.0], [46.6, 2385.0], [46.7, 2385.0], [46.8, 2385.0], [46.9, 2388.0], [47.0, 2389.0], [47.1, 2389.0], [47.2, 2398.0], [47.3, 2401.0], [47.4, 2405.0], [47.5, 2405.0], [47.6, 2407.0], [47.7, 2412.0], [47.8, 2413.0], [47.9, 2415.0], [48.0, 2417.0], [48.1, 2418.0], [48.2, 2425.0], [48.3, 2430.0], [48.4, 2441.0], [48.5, 2443.0], [48.6, 2447.0], [48.7, 2449.0], [48.8, 2455.0], [48.9, 2456.0], [49.0, 2464.0], [49.1, 2465.0], [49.2, 2472.0], [49.3, 2473.0], [49.4, 2476.0], [49.5, 2480.0], [49.6, 2481.0], [49.7, 2485.0], [49.8, 2494.0], [49.9, 2495.0], [50.0, 2500.0], [50.1, 2504.0], [50.2, 2506.0], [50.3, 2512.0], [50.4, 2518.0], [50.5, 2519.0], [50.6, 2520.0], [50.7, 2521.0], [50.8, 2522.0], [50.9, 2523.0], [51.0, 2523.0], [51.1, 2524.0], [51.2, 2527.0], [51.3, 2533.0], [51.4, 2534.0], [51.5, 2536.0], [51.6, 2536.0], [51.7, 2536.0], [51.8, 2537.0], [51.9, 2539.0], [52.0, 2542.0], [52.1, 2543.0], [52.2, 2545.0], [52.3, 2548.0], [52.4, 2549.0], [52.5, 2549.0], [52.6, 2554.0], [52.7, 2558.0], [52.8, 2562.0], [52.9, 2564.0], [53.0, 2565.0], [53.1, 2565.0], [53.2, 2569.0], [53.3, 2570.0], [53.4, 2580.0], [53.5, 2585.0], [53.6, 2587.0], [53.7, 2588.0], [53.8, 2589.0], [53.9, 2589.0], [54.0, 2591.0], [54.1, 2591.0], [54.2, 2593.0], [54.3, 2597.0], [54.4, 2599.0], [54.5, 2603.0], [54.6, 2611.0], [54.7, 2612.0], [54.8, 2631.0], [54.9, 2639.0], [55.0, 2646.0], [55.1, 2647.0], [55.2, 2651.0], [55.3, 2656.0], [55.4, 2656.0], [55.5, 2659.0], [55.6, 2661.0], [55.7, 2663.0], [55.8, 2665.0], [55.9, 2666.0], [56.0, 2671.0], [56.1, 2671.0], [56.2, 2671.0], [56.3, 2675.0], [56.4, 2675.0], [56.5, 2682.0], [56.6, 2684.0], [56.7, 2686.0], [56.8, 2689.0], [56.9, 2694.0], [57.0, 2696.0], [57.1, 2698.0], [57.2, 2698.0], [57.3, 2702.0], [57.4, 2708.0], [57.5, 2710.0], [57.6, 2711.0], [57.7, 2712.0], [57.8, 2714.0], [57.9, 2717.0], [58.0, 2720.0], [58.1, 2722.0], [58.2, 2729.0], [58.3, 2732.0], [58.4, 2736.0], [58.5, 2740.0], [58.6, 2741.0], [58.7, 2741.0], [58.8, 2746.0], [58.9, 2751.0], [59.0, 2757.0], [59.1, 2759.0], [59.2, 2759.0], [59.3, 2770.0], [59.4, 2776.0], [59.5, 2779.0], [59.6, 2782.0], [59.7, 2784.0], [59.8, 2787.0], [59.9, 2794.0], [60.0, 2802.0], [60.1, 2803.0], [60.2, 2805.0], [60.3, 2805.0], [60.4, 2811.0], [60.5, 2816.0], [60.6, 2824.0], [60.7, 2825.0], [60.8, 2825.0], [60.9, 2832.0], [61.0, 2834.0], [61.1, 2835.0], [61.2, 2836.0], [61.3, 2836.0], [61.4, 2845.0], [61.5, 2845.0], [61.6, 2849.0], [61.7, 2851.0], [61.8, 2852.0], [61.9, 2854.0], [62.0, 2864.0], [62.1, 2865.0], [62.2, 2865.0], [62.3, 2873.0], [62.4, 2874.0], [62.5, 2875.0], [62.6, 2886.0], [62.7, 2899.0], [62.8, 2904.0], [62.9, 2913.0], [63.0, 2914.0], [63.1, 2915.0], [63.2, 2915.0], [63.3, 2924.0], [63.4, 2924.0], [63.5, 2928.0], [63.6, 2930.0], [63.7, 2938.0], [63.8, 2943.0], [63.9, 2948.0], [64.0, 2949.0], [64.1, 2956.0], [64.2, 2958.0], [64.3, 2964.0], [64.4, 2966.0], [64.5, 2969.0], [64.6, 2975.0], [64.7, 2979.0], [64.8, 2979.0], [64.9, 2985.0], [65.0, 2986.0], [65.1, 2986.0], [65.2, 2986.0], [65.3, 2991.0], [65.4, 2992.0], [65.5, 2993.0], [65.6, 2994.0], [65.7, 2998.0], [65.8, 3001.0], [65.9, 3002.0], [66.0, 3015.0], [66.1, 3015.0], [66.2, 3020.0], [66.3, 3026.0], [66.4, 3034.0], [66.5, 3036.0], [66.6, 3038.0], [66.7, 3042.0], [66.8, 3048.0], [66.9, 3051.0], [67.0, 3055.0], [67.1, 3063.0], [67.2, 3067.0], [67.3, 3071.0], [67.4, 3071.0], [67.5, 3073.0], [67.6, 3074.0], [67.7, 3106.0], [67.8, 3109.0], [67.9, 3114.0], [68.0, 3118.0], [68.1, 3118.0], [68.2, 3121.0], [68.3, 3121.0], [68.4, 3122.0], [68.5, 3124.0], [68.6, 3130.0], [68.7, 3130.0], [68.8, 3132.0], [68.9, 3139.0], [69.0, 3140.0], [69.1, 3140.0], [69.2, 3141.0], [69.3, 3144.0], [69.4, 3145.0], [69.5, 3148.0], [69.6, 3157.0], [69.7, 3157.0], [69.8, 3160.0], [69.9, 3161.0], [70.0, 3161.0], [70.1, 3163.0], [70.2, 3167.0], [70.3, 3169.0], [70.4, 3180.0], [70.5, 3181.0], [70.6, 3188.0], [70.7, 3194.0], [70.8, 3197.0], [70.9, 3197.0], [71.0, 3199.0], [71.1, 3200.0], [71.2, 3206.0], [71.3, 3208.0], [71.4, 3208.0], [71.5, 3213.0], [71.6, 3218.0], [71.7, 3221.0], [71.8, 3227.0], [71.9, 3229.0], [72.0, 3230.0], [72.1, 3234.0], [72.2, 3239.0], [72.3, 3239.0], [72.4, 3243.0], [72.5, 3250.0], [72.6, 3251.0], [72.7, 3257.0], [72.8, 3259.0], [72.9, 3261.0], [73.0, 3261.0], [73.1, 3263.0], [73.2, 3263.0], [73.3, 3268.0], [73.4, 3271.0], [73.5, 3276.0], [73.6, 3277.0], [73.7, 3277.0], [73.8, 3285.0], [73.9, 3289.0], [74.0, 3300.0], [74.1, 3303.0], [74.2, 3304.0], [74.3, 3306.0], [74.4, 3307.0], [74.5, 3308.0], [74.6, 3308.0], [74.7, 3310.0], [74.8, 3312.0], [74.9, 3317.0], [75.0, 3320.0], [75.1, 3322.0], [75.2, 3328.0], [75.3, 3330.0], [75.4, 3331.0], [75.5, 3335.0], [75.6, 3337.0], [75.7, 3338.0], [75.8, 3338.0], [75.9, 3338.0], [76.0, 3339.0], [76.1, 3344.0], [76.2, 3348.0], [76.3, 3349.0], [76.4, 3352.0], [76.5, 3352.0], [76.6, 3353.0], [76.7, 3361.0], [76.8, 3362.0], [76.9, 3364.0], [77.0, 3364.0], [77.1, 3364.0], [77.2, 3365.0], [77.3, 3367.0], [77.4, 3373.0], [77.5, 3374.0], [77.6, 3379.0], [77.7, 3389.0], [77.8, 3390.0], [77.9, 3390.0], [78.0, 3393.0], [78.1, 3395.0], [78.2, 3397.0], [78.3, 3404.0], [78.4, 3404.0], [78.5, 3406.0], [78.6, 3406.0], [78.7, 3408.0], [78.8, 3410.0], [78.9, 3415.0], [79.0, 3415.0], [79.1, 3417.0], [79.2, 3419.0], [79.3, 3424.0], [79.4, 3425.0], [79.5, 3430.0], [79.6, 3433.0], [79.7, 3433.0], [79.8, 3440.0], [79.9, 3443.0], [80.0, 3450.0], [80.1, 3452.0], [80.2, 3453.0], [80.3, 3454.0], [80.4, 3456.0], [80.5, 3456.0], [80.6, 3459.0], [80.7, 3486.0], [80.8, 3489.0], [80.9, 3490.0], [81.0, 3492.0], [81.1, 3493.0], [81.2, 3496.0], [81.3, 3497.0], [81.4, 3500.0], [81.5, 3501.0], [81.6, 3502.0], [81.7, 3506.0], [81.8, 3507.0], [81.9, 3509.0], [82.0, 3510.0], [82.1, 3518.0], [82.2, 3527.0], [82.3, 3528.0], [82.4, 3533.0], [82.5, 3534.0], [82.6, 3534.0], [82.7, 3537.0], [82.8, 3539.0], [82.9, 3545.0], [83.0, 3551.0], [83.1, 3553.0], [83.2, 3554.0], [83.3, 3558.0], [83.4, 3566.0], [83.5, 3571.0], [83.6, 3572.0], [83.7, 3572.0], [83.8, 3577.0], [83.9, 3577.0], [84.0, 3591.0], [84.1, 3597.0], [84.2, 3600.0], [84.3, 3601.0], [84.4, 3606.0], [84.5, 3608.0], [84.6, 3617.0], [84.7, 3623.0], [84.8, 3628.0], [84.9, 3637.0], [85.0, 3638.0], [85.1, 3640.0], [85.2, 3641.0], [85.3, 3641.0], [85.4, 3647.0], [85.5, 3650.0], [85.6, 3651.0], [85.7, 3653.0], [85.8, 3653.0], [85.9, 3657.0], [86.0, 3661.0], [86.1, 3661.0], [86.2, 3662.0], [86.3, 3666.0], [86.4, 3666.0], [86.5, 3670.0], [86.6, 3678.0], [86.7, 3680.0], [86.8, 3683.0], [86.9, 3686.0], [87.0, 3687.0], [87.1, 3690.0], [87.2, 3691.0], [87.3, 3692.0], [87.4, 3700.0], [87.5, 3700.0], [87.6, 3700.0], [87.7, 3705.0], [87.8, 3710.0], [87.9, 3714.0], [88.0, 3714.0], [88.1, 3715.0], [88.2, 3723.0], [88.3, 3724.0], [88.4, 3728.0], [88.5, 3737.0], [88.6, 3741.0], [88.7, 3743.0], [88.8, 3747.0], [88.9, 3753.0], [89.0, 3757.0], [89.1, 3762.0], [89.2, 3765.0], [89.3, 3765.0], [89.4, 3766.0], [89.5, 3768.0], [89.6, 3780.0], [89.7, 3780.0], [89.8, 3782.0], [89.9, 3782.0], [90.0, 3784.0], [90.1, 3794.0], [90.2, 3795.0], [90.3, 3798.0], [90.4, 3799.0], [90.5, 3806.0], [90.6, 3806.0], [90.7, 3808.0], [90.8, 3810.0], [90.9, 3814.0], [91.0, 3815.0], [91.1, 3815.0], [91.2, 3833.0], [91.3, 3837.0], [91.4, 3843.0], [91.5, 3853.0], [91.6, 3863.0], [91.7, 3865.0], [91.8, 3870.0], [91.9, 3870.0], [92.0, 3878.0], [92.1, 3880.0], [92.2, 3883.0], [92.3, 3895.0], [92.4, 3896.0], [92.5, 3897.0], [92.6, 3904.0], [92.7, 3912.0], [92.8, 3913.0], [92.9, 3915.0], [93.0, 3918.0], [93.1, 3918.0], [93.2, 3923.0], [93.3, 3927.0], [93.4, 3927.0], [93.5, 3935.0], [93.6, 3938.0], [93.7, 3938.0], [93.8, 3942.0], [93.9, 3943.0], [94.0, 3958.0], [94.1, 3968.0], [94.2, 3974.0], [94.3, 3979.0], [94.4, 3986.0], [94.5, 3994.0], [94.6, 4005.0], [94.7, 4008.0], [94.8, 4014.0], [94.9, 4018.0], [95.0, 4032.0], [95.1, 4033.0], [95.2, 4036.0], [95.3, 4040.0], [95.4, 4043.0], [95.5, 4056.0], [95.6, 4058.0], [95.7, 4061.0], [95.8, 4072.0], [95.9, 4080.0], [96.0, 4091.0], [96.1, 4096.0], [96.2, 4107.0], [96.3, 4128.0], [96.4, 4134.0], [96.5, 4144.0], [96.6, 4146.0], [96.7, 4196.0], [96.8, 4198.0], [96.9, 4198.0], [97.0, 4203.0], [97.1, 4204.0], [97.2, 4212.0], [97.3, 4214.0], [97.4, 4256.0], [97.5, 4271.0], [97.6, 4286.0], [97.7, 4301.0], [97.8, 4318.0], [97.9, 4326.0], [98.0, 4339.0], [98.1, 4351.0], [98.2, 4360.0], [98.3, 4381.0], [98.4, 4402.0], [98.5, 4415.0], [98.6, 4509.0], [98.7, 4516.0], [98.8, 4566.0], [98.9, 4588.0], [99.0, 4589.0], [99.1, 4624.0], [99.2, 4719.0], [99.3, 4733.0], [99.4, 4870.0], [99.5, 5011.0], [99.6, 5030.0], [99.7, 5163.0], [99.8, 5298.0], [99.9, 5351.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 200.0, "maxY": 46.0, "series": [{"data": [[600.0, 1.0], [700.0, 3.0], [800.0, 1.0], [900.0, 9.0], [1000.0, 7.0], [1100.0, 18.0], [1200.0, 18.0], [1300.0, 21.0], [1400.0, 38.0], [1500.0, 30.0], [1600.0, 36.0], [1700.0, 46.0], [1800.0, 37.0], [1900.0, 42.0], [2000.0, 40.0], [2100.0, 27.0], [2300.0, 34.0], [2200.0, 27.0], [2400.0, 27.0], [2500.0, 45.0], [2600.0, 28.0], [2700.0, 27.0], [2800.0, 28.0], [2900.0, 30.0], [3000.0, 19.0], [3100.0, 34.0], [3200.0, 29.0], [3300.0, 44.0], [3400.0, 31.0], [3500.0, 28.0], [3600.0, 32.0], [3700.0, 31.0], [3800.0, 21.0], [3900.0, 20.0], [4000.0, 16.0], [4100.0, 8.0], [4300.0, 7.0], [4200.0, 7.0], [4500.0, 5.0], [4400.0, 2.0], [4600.0, 1.0], [4800.0, 1.0], [4700.0, 2.0], [5000.0, 2.0], [5100.0, 1.0], [5200.0, 1.0], [5300.0, 1.0], [200.0, 13.0], [300.0, 21.0], [400.0, 3.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 5300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 37.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 847.0, "series": [{"data": [[1.0, 116.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 37.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 847.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 220.9250000000003, "minX": 1.54960818E12, "maxY": 220.9250000000003, "series": [{"data": [[1.54960818E12, 220.9250000000003]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960818E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 677.625, "minX": 1.0, "maxY": 5351.0, "series": [{"data": [[2.0, 3456.0], [3.0, 2671.0], [5.0, 2902.0], [6.0, 3497.0], [7.0, 2548.0], [8.0, 2554.0], [9.0, 2381.0], [10.0, 2520.0], [11.0, 2558.0], [12.0, 3496.0], [13.0, 3389.0], [14.0, 3641.0], [15.0, 3459.0], [16.0, 2603.0], [17.0, 2924.0], [18.0, 2473.0], [19.0, 3653.0], [20.0, 2455.0], [22.0, 2737.0], [23.0, 2371.0], [24.0, 2948.0], [25.0, 3234.0], [26.0, 2805.0], [28.0, 2974.5], [29.0, 3662.0], [30.0, 2832.0], [33.0, 677.625], [32.0, 1371.6], [35.0, 688.5], [34.0, 835.6], [37.0, 1056.0], [36.0, 951.2], [39.0, 1197.75], [38.0, 2154.0], [41.0, 809.5], [40.0, 832.5], [43.0, 2373.0], [42.0, 3558.0], [45.0, 2527.0], [44.0, 2852.0], [47.0, 2591.0], [46.0, 3303.0], [49.0, 3577.0], [48.0, 2992.0], [51.0, 2385.0], [50.0, 2886.0], [52.0, 2899.0], [55.0, 3188.0], [54.0, 2728.0], [56.0, 3365.0], [59.0, 2413.0], [58.0, 2929.5], [61.0, 4061.0], [60.0, 3440.0], [63.0, 2585.0], [62.0, 4339.0], [67.0, 3352.0], [66.0, 2322.0], [65.0, 3808.0], [64.0, 4256.0], [71.0, 3476.0], [69.0, 3799.0], [68.0, 2521.0], [75.0, 2924.0], [74.0, 4096.0], [73.0, 3896.0], [72.0, 3042.0], [79.0, 2770.0], [78.0, 2591.0], [77.0, 3239.0], [76.0, 3289.0], [83.0, 3795.0], [82.0, 2710.0], [81.0, 3895.0], [80.0, 3425.0], [87.0, 2816.0], [86.0, 2913.0], [85.0, 3509.0], [84.0, 3715.0], [91.0, 3837.0], [90.0, 2519.0], [89.0, 3714.0], [88.0, 2991.0], [95.0, 2366.0], [94.0, 3404.0], [93.0, 3710.0], [92.0, 3794.0], [97.0, 1821.5], [96.0, 1750.6666666666665], [99.0, 1748.5], [98.0, 3001.0], [100.0, 1951.0], [103.0, 2682.0], [102.0, 3757.0], [101.0, 3705.0], [106.0, 1640.0], [105.0, 2048.5], [107.0, 1008.0], [104.0, 2824.0], [108.0, 2366.3333333333335], [111.0, 3194.0], [110.0, 2825.0], [109.0, 3545.0], [115.0, 2720.6666666666665], [114.0, 1122.0], [113.0, 4146.0], [112.0, 2536.0], [119.0, 2864.0], [118.0, 3166.5], [116.0, 2430.0], [121.0, 2020.5], [122.0, 3145.0], [120.0, 2257.0], [127.0, 3169.0], [126.0, 2485.0], [125.0, 2993.0], [124.0, 3252.0], [130.0, 2236.0], [135.0, 2845.0], [134.0, 2564.0], [133.0, 2646.0], [132.0, 3628.0], [131.0, 2512.0], [129.0, 2401.0], [128.0, 3510.0], [141.0, 2039.6666666666665], [143.0, 2523.0], [142.0, 3780.0], [140.0, 4516.0], [139.0, 2938.0], [138.0, 3863.0], [137.0, 2675.0], [136.0, 3071.0], [144.0, 1857.5], [151.0, 2339.5], [150.0, 2555.5], [148.0, 2418.0], [147.0, 2173.0], [146.0, 5351.0], [145.0, 2684.0], [152.0, 1829.5], [153.0, 1870.5], [159.0, 1811.5], [158.0, 4509.0], [157.0, 3700.0], [156.0, 3963.0], [154.0, 3661.0], [162.0, 1834.6666666666665], [161.0, 3247.0], [163.0, 2716.0], [164.0, 1710.5], [167.0, 2164.0], [166.0, 3687.0], [165.0, 2708.0], [160.0, 3221.0], [168.0, 2848.0], [170.0, 1611.6874999999998], [172.0, 1431.5000000000002], [171.0, 1766.5], [169.0, 1819.0], [173.0, 1628.6666666666663], [174.0, 1955.7777777777778], [175.0, 1867.4285714285713], [176.0, 1633.5], [178.0, 2052.6666666666665], [177.0, 1757.6666666666665], [179.0, 1889.6666666666667], [181.0, 1605.5714285714287], [180.0, 1729.6666666666667], [183.0, 3263.0], [182.0, 2784.0], [184.0, 2417.0], [185.0, 2261.5], [187.0, 2007.6666666666665], [188.0, 2660.5], [186.0, 2072.3333333333335], [190.0, 1776.7777777777778], [191.0, 1626.0], [189.0, 4032.0], [193.0, 2074.0], [195.0, 1980.5714285714284], [194.0, 2148.25], [196.0, 2314.25], [197.0, 1825.9285714285713], [192.0, 2667.3333333333335], [198.0, 1966.4444444444443], [199.0, 2569.0], [202.0, 1842.5], [204.0, 1998.5555555555557], [205.0, 1965.875], [203.0, 1897.4], [206.0, 2481.3333333333335], [207.0, 2756.3333333333335], [201.0, 4203.0], [200.0, 3322.0], [212.0, 2174.0], [211.0, 2120.3333333333335], [210.0, 2781.5], [214.0, 2073.6666666666665], [215.0, 3067.0], [213.0, 3878.0], [209.0, 3257.0], [208.0, 3766.0], [217.0, 2386.0], [218.0, 2225.75], [220.0, 1806.1666666666665], [219.0, 2321.6666666666665], [223.0, 2511.5], [222.0, 3641.0], [221.0, 3199.0], [216.0, 3161.0], [225.0, 2291.3333333333335], [224.0, 2508.5], [226.0, 2218.0], [227.0, 1978.913043478261], [228.0, 1939.75], [229.0, 2153.0], [230.0, 2089.2], [231.0, 2805.6666666666665], [232.0, 3093.5], [234.0, 1965.0], [238.0, 2263.0], [239.0, 2849.0], [237.0, 4415.0], [236.0, 4128.0], [235.0, 3367.0], [233.0, 4271.0], [240.0, 2082.0], [245.0, 3051.3333333333335], [246.0, 2559.3333333333335], [247.0, 2630.5], [244.0, 3927.0], [243.0, 3331.0], [242.0, 4008.0], [241.0, 3148.0], [248.0, 2487.5], [251.0, 2423.0], [254.0, 2452.3333333333335], [253.0, 3375.5], [255.0, 4301.0], [252.0, 3362.0], [250.0, 3566.0], [249.0, 3533.0], [257.0, 2177.1], [258.0, 2116.8], [261.0, 2491.5], [260.0, 2137.0], [259.0, 3064.0], [265.0, 2420.066666666666], [266.0, 2469.1111111111113], [267.0, 4566.0], [264.0, 2126.7142857142853], [269.0, 3062.0], [268.0, 3218.0], [270.0, 1938.0], [271.0, 2795.3333333333335], [263.0, 2245.3333333333335], [256.0, 3690.0], [262.0, 2194.230769230769], [273.0, 3292.6666666666665], [272.0, 3175.0], [274.0, 2698.0], [284.0, 2889.0], [275.0, 3239.0], [287.0, 2791.625], [286.0, 3601.5], [285.0, 2803.5], [276.0, 2774.3333333333335], [279.0, 2744.0], [278.0, 2911.5], [277.0, 5030.0], [280.0, 3195.0], [281.0, 2333.5], [282.0, 2303.0], [283.0, 2501.0], [302.0, 3404.0], [290.0, 2917.0], [291.0, 2869.6666666666665], [301.0, 4539.0], [293.0, 2887.6666666666665], [292.0, 2534.0], [294.0, 2674.75], [295.0, 2521.0], [289.0, 3227.0], [288.0, 3259.0], [297.0, 2565.6666666666665], [299.0, 2320.75], [298.0, 3186.0], [303.0, 4014.0], [296.0, 4036.0], [318.0, 3815.0], [319.0, 1863.0], [317.0, 3361.0], [316.0, 3424.0], [315.0, 2375.0], [314.0, 3601.0], [313.0, 3197.0], [312.0, 4198.0], [311.0, 3537.0], [305.0, 3390.0], [304.0, 3393.0], [307.0, 3692.0], [306.0, 3650.0], [310.0, 3310.0], [309.0, 3180.0], [308.0, 4204.0], [334.0, 3364.0], [335.0, 3678.0], [333.0, 3904.0], [332.0, 3782.0], [331.0, 3880.0], [330.0, 3938.0], [329.0, 3700.0], [328.0, 3486.0], [327.0, 4870.0], [320.0, 4402.0], [322.0, 3452.0], [321.0, 3118.0], [326.0, 4080.0], [325.0, 3571.0], [324.0, 3176.0], [350.0, 3761.5], [351.0, 4198.0], [348.0, 3349.0], [339.0, 3141.0], [338.0, 3330.0], [337.0, 3489.0], [336.0, 3518.0], [347.0, 4072.0], [346.0, 3806.0], [345.0, 4056.0], [344.0, 3417.0], [343.0, 3539.0], [342.0, 3163.0], [341.0, 2851.0], [340.0, 4360.0], [366.0, 4196.0], [367.0, 3397.0], [365.0, 3140.0], [364.0, 3261.0], [363.0, 3051.0], [362.0, 3700.0], [361.0, 3577.0], [360.0, 3666.0], [359.0, 3942.0], [353.0, 3554.0], [352.0, 4318.0], [355.0, 3833.0], [354.0, 3943.0], [358.0, 3306.0], [357.0, 3806.0], [356.0, 3387.0], [371.0, 3418.0], [377.0, 3289.3333333333335], [378.0, 3165.2], [379.0, 3311.3333333333335], [376.0, 3088.0], [382.0, 3076.0000000000005], [383.0, 3126.8333333333335], [380.0, 3239.6], [381.0, 3010.2], [375.0, 3216.6666666666665], [374.0, 2963.6], [373.0, 3006.3333333333335], [372.0, 3590.6666666666665], [370.0, 2663.5], [369.0, 3528.0], [368.0, 2836.0], [385.0, 2767.5], [384.0, 3344.6666666666665], [386.0, 3065.5], [387.0, 3168.6], [388.0, 2864.0], [389.0, 3497.0], [390.0, 2782.0], [391.0, 4091.0], [393.0, 3233.3333333333335], [398.0, 3247.25], [397.0, 2542.0], [396.0, 3271.0], [399.0, 3113.0], [394.0, 3724.0], [395.0, 3674.0], [401.0, 3104.0], [400.0, 3473.3333333333335], [402.0, 3534.5], [404.0, 3237.0], [405.0, 2984.0], [406.0, 3450.3333333333335], [407.0, 3326.75], [408.0, 3737.0], [403.0, 3714.0], [1.0, 3419.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[220.9250000000003, 2512.4369999999994]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 408.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 6250.0, "minX": 1.54960818E12, "maxY": 7015.316666666667, "series": [{"data": [[1.54960818E12, 7015.316666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960818E12, 6250.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960818E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 2512.4369999999994, "minX": 1.54960818E12, "maxY": 2512.4369999999994, "series": [{"data": [[1.54960818E12, 2512.4369999999994]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960818E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 2512.428999999997, "minX": 1.54960818E12, "maxY": 2512.428999999997, "series": [{"data": [[1.54960818E12, 2512.428999999997]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960818E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 37.32199999999998, "minX": 1.54960818E12, "maxY": 37.32199999999998, "series": [{"data": [[1.54960818E12, 37.32199999999998]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960818E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 234.0, "minX": 1.54960818E12, "maxY": 5351.0, "series": [{"data": [[1.54960818E12, 5351.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960818E12, 234.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960818E12, 3783.8]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960818E12, 4588.99]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960818E12, 4031.2999999999993]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960818E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 2502.0, "minX": 16.0, "maxY": 2502.0, "series": [{"data": [[16.0, 2502.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 2502.0, "minX": 16.0, "maxY": 2502.0, "series": [{"data": [[16.0, 2502.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54960818E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54960818E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960818E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54960818E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54960818E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960818E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.54960818E12, "maxY": 16.666666666666668, "series": [{"data": [[1.54960818E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960818E12, "title": "Transactions Per Second"}},
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
