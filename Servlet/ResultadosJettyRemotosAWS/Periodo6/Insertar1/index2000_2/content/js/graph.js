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
        data: {"result": {"minY": 97.0, "minX": 0.0, "maxY": 5865.0, "series": [{"data": [[0.0, 97.0], [0.1, 122.0], [0.2, 124.0], [0.3, 125.0], [0.4, 139.0], [0.5, 140.0], [0.6, 143.0], [0.7, 144.0], [0.8, 147.0], [0.9, 151.0], [1.0, 151.0], [1.1, 152.0], [1.2, 157.0], [1.3, 160.0], [1.4, 163.0], [1.5, 168.0], [1.6, 171.0], [1.7, 172.0], [1.8, 173.0], [1.9, 178.0], [2.0, 178.0], [2.1, 180.0], [2.2, 180.0], [2.3, 181.0], [2.4, 182.0], [2.5, 182.0], [2.6, 184.0], [2.7, 189.0], [2.8, 190.0], [2.9, 191.0], [3.0, 195.0], [3.1, 195.0], [3.2, 197.0], [3.3, 198.0], [3.4, 200.0], [3.5, 202.0], [3.6, 202.0], [3.7, 205.0], [3.8, 206.0], [3.9, 208.0], [4.0, 211.0], [4.1, 211.0], [4.2, 212.0], [4.3, 215.0], [4.4, 216.0], [4.5, 217.0], [4.6, 218.0], [4.7, 218.0], [4.8, 221.0], [4.9, 222.0], [5.0, 223.0], [5.1, 225.0], [5.2, 227.0], [5.3, 229.0], [5.4, 233.0], [5.5, 235.0], [5.6, 235.0], [5.7, 236.0], [5.8, 236.0], [5.9, 238.0], [6.0, 239.0], [6.1, 241.0], [6.2, 241.0], [6.3, 242.0], [6.4, 243.0], [6.5, 243.0], [6.6, 247.0], [6.7, 248.0], [6.8, 248.0], [6.9, 249.0], [7.0, 251.0], [7.1, 252.0], [7.2, 252.0], [7.3, 256.0], [7.4, 257.0], [7.5, 261.0], [7.6, 263.0], [7.7, 264.0], [7.8, 266.0], [7.9, 267.0], [8.0, 272.0], [8.1, 278.0], [8.2, 279.0], [8.3, 281.0], [8.4, 283.0], [8.5, 284.0], [8.6, 285.0], [8.7, 285.0], [8.8, 289.0], [8.9, 292.0], [9.0, 293.0], [9.1, 296.0], [9.2, 301.0], [9.3, 305.0], [9.4, 313.0], [9.5, 316.0], [9.6, 320.0], [9.7, 324.0], [9.8, 324.0], [9.9, 329.0], [10.0, 329.0], [10.1, 330.0], [10.2, 335.0], [10.3, 336.0], [10.4, 340.0], [10.5, 341.0], [10.6, 343.0], [10.7, 345.0], [10.8, 350.0], [10.9, 351.0], [11.0, 364.0], [11.1, 369.0], [11.2, 377.0], [11.3, 384.0], [11.4, 389.0], [11.5, 390.0], [11.6, 390.0], [11.7, 392.0], [11.8, 393.0], [11.9, 399.0], [12.0, 402.0], [12.1, 404.0], [12.2, 412.0], [12.3, 413.0], [12.4, 413.0], [12.5, 414.0], [12.6, 416.0], [12.7, 416.0], [12.8, 422.0], [12.9, 428.0], [13.0, 431.0], [13.1, 437.0], [13.2, 440.0], [13.3, 449.0], [13.4, 453.0], [13.5, 463.0], [13.6, 464.0], [13.7, 470.0], [13.8, 476.0], [13.9, 478.0], [14.0, 479.0], [14.1, 493.0], [14.2, 494.0], [14.3, 495.0], [14.4, 496.0], [14.5, 497.0], [14.6, 499.0], [14.7, 506.0], [14.8, 517.0], [14.9, 526.0], [15.0, 529.0], [15.1, 532.0], [15.2, 536.0], [15.3, 539.0], [15.4, 541.0], [15.5, 557.0], [15.6, 563.0], [15.7, 567.0], [15.8, 571.0], [15.9, 574.0], [16.0, 578.0], [16.1, 588.0], [16.2, 592.0], [16.3, 596.0], [16.4, 604.0], [16.5, 606.0], [16.6, 623.0], [16.7, 627.0], [16.8, 631.0], [16.9, 635.0], [17.0, 639.0], [17.1, 645.0], [17.2, 650.0], [17.3, 661.0], [17.4, 667.0], [17.5, 682.0], [17.6, 685.0], [17.7, 692.0], [17.8, 704.0], [17.9, 705.0], [18.0, 709.0], [18.1, 713.0], [18.2, 721.0], [18.3, 723.0], [18.4, 726.0], [18.5, 728.0], [18.6, 740.0], [18.7, 742.0], [18.8, 745.0], [18.9, 748.0], [19.0, 757.0], [19.1, 762.0], [19.2, 766.0], [19.3, 769.0], [19.4, 770.0], [19.5, 776.0], [19.6, 790.0], [19.7, 792.0], [19.8, 797.0], [19.9, 809.0], [20.0, 815.0], [20.1, 820.0], [20.2, 842.0], [20.3, 856.0], [20.4, 865.0], [20.5, 881.0], [20.6, 887.0], [20.7, 897.0], [20.8, 903.0], [20.9, 906.0], [21.0, 909.0], [21.1, 914.0], [21.2, 927.0], [21.3, 943.0], [21.4, 950.0], [21.5, 956.0], [21.6, 956.0], [21.7, 962.0], [21.8, 968.0], [21.9, 969.0], [22.0, 979.0], [22.1, 986.0], [22.2, 988.0], [22.3, 992.0], [22.4, 1012.0], [22.5, 1022.0], [22.6, 1027.0], [22.7, 1032.0], [22.8, 1039.0], [22.9, 1043.0], [23.0, 1047.0], [23.1, 1049.0], [23.2, 1052.0], [23.3, 1058.0], [23.4, 1067.0], [23.5, 1070.0], [23.6, 1074.0], [23.7, 1089.0], [23.8, 1099.0], [23.9, 1105.0], [24.0, 1116.0], [24.1, 1129.0], [24.2, 1138.0], [24.3, 1151.0], [24.4, 1163.0], [24.5, 1167.0], [24.6, 1173.0], [24.7, 1177.0], [24.8, 1182.0], [24.9, 1186.0], [25.0, 1193.0], [25.1, 1198.0], [25.2, 1203.0], [25.3, 1220.0], [25.4, 1226.0], [25.5, 1238.0], [25.6, 1241.0], [25.7, 1251.0], [25.8, 1259.0], [25.9, 1261.0], [26.0, 1266.0], [26.1, 1273.0], [26.2, 1284.0], [26.3, 1300.0], [26.4, 1311.0], [26.5, 1314.0], [26.6, 1325.0], [26.7, 1334.0], [26.8, 1349.0], [26.9, 1351.0], [27.0, 1352.0], [27.1, 1357.0], [27.2, 1362.0], [27.3, 1371.0], [27.4, 1379.0], [27.5, 1385.0], [27.6, 1393.0], [27.7, 1404.0], [27.8, 1414.0], [27.9, 1420.0], [28.0, 1420.0], [28.1, 1422.0], [28.2, 1436.0], [28.3, 1445.0], [28.4, 1448.0], [28.5, 1451.0], [28.6, 1456.0], [28.7, 1468.0], [28.8, 1473.0], [28.9, 1477.0], [29.0, 1486.0], [29.1, 1489.0], [29.2, 1493.0], [29.3, 1502.0], [29.4, 1508.0], [29.5, 1510.0], [29.6, 1515.0], [29.7, 1520.0], [29.8, 1530.0], [29.9, 1539.0], [30.0, 1540.0], [30.1, 1556.0], [30.2, 1561.0], [30.3, 1579.0], [30.4, 1589.0], [30.5, 1597.0], [30.6, 1604.0], [30.7, 1619.0], [30.8, 1629.0], [30.9, 1631.0], [31.0, 1634.0], [31.1, 1636.0], [31.2, 1636.0], [31.3, 1644.0], [31.4, 1649.0], [31.5, 1652.0], [31.6, 1655.0], [31.7, 1656.0], [31.8, 1669.0], [31.9, 1677.0], [32.0, 1690.0], [32.1, 1696.0], [32.2, 1702.0], [32.3, 1705.0], [32.4, 1709.0], [32.5, 1715.0], [32.6, 1721.0], [32.7, 1721.0], [32.8, 1722.0], [32.9, 1726.0], [33.0, 1730.0], [33.1, 1733.0], [33.2, 1737.0], [33.3, 1738.0], [33.4, 1745.0], [33.5, 1752.0], [33.6, 1758.0], [33.7, 1760.0], [33.8, 1767.0], [33.9, 1778.0], [34.0, 1779.0], [34.1, 1784.0], [34.2, 1786.0], [34.3, 1792.0], [34.4, 1793.0], [34.5, 1799.0], [34.6, 1807.0], [34.7, 1811.0], [34.8, 1813.0], [34.9, 1819.0], [35.0, 1822.0], [35.1, 1825.0], [35.2, 1827.0], [35.3, 1837.0], [35.4, 1842.0], [35.5, 1849.0], [35.6, 1850.0], [35.7, 1853.0], [35.8, 1855.0], [35.9, 1860.0], [36.0, 1868.0], [36.1, 1869.0], [36.2, 1873.0], [36.3, 1875.0], [36.4, 1881.0], [36.5, 1888.0], [36.6, 1896.0], [36.7, 1898.0], [36.8, 1906.0], [36.9, 1915.0], [37.0, 1920.0], [37.1, 1930.0], [37.2, 1938.0], [37.3, 1943.0], [37.4, 1947.0], [37.5, 1947.0], [37.6, 1949.0], [37.7, 1952.0], [37.8, 1954.0], [37.9, 1957.0], [38.0, 1958.0], [38.1, 1961.0], [38.2, 1967.0], [38.3, 1969.0], [38.4, 1976.0], [38.5, 1983.0], [38.6, 1986.0], [38.7, 1989.0], [38.8, 1999.0], [38.9, 1999.0], [39.0, 2006.0], [39.1, 2016.0], [39.2, 2023.0], [39.3, 2025.0], [39.4, 2036.0], [39.5, 2038.0], [39.6, 2054.0], [39.7, 2067.0], [39.8, 2069.0], [39.9, 2074.0], [40.0, 2075.0], [40.1, 2076.0], [40.2, 2089.0], [40.3, 2097.0], [40.4, 2101.0], [40.5, 2102.0], [40.6, 2103.0], [40.7, 2106.0], [40.8, 2114.0], [40.9, 2114.0], [41.0, 2116.0], [41.1, 2116.0], [41.2, 2118.0], [41.3, 2120.0], [41.4, 2125.0], [41.5, 2128.0], [41.6, 2130.0], [41.7, 2131.0], [41.8, 2135.0], [41.9, 2138.0], [42.0, 2153.0], [42.1, 2154.0], [42.2, 2161.0], [42.3, 2162.0], [42.4, 2167.0], [42.5, 2188.0], [42.6, 2202.0], [42.7, 2204.0], [42.8, 2212.0], [42.9, 2220.0], [43.0, 2231.0], [43.1, 2233.0], [43.2, 2236.0], [43.3, 2245.0], [43.4, 2247.0], [43.5, 2250.0], [43.6, 2251.0], [43.7, 2254.0], [43.8, 2256.0], [43.9, 2258.0], [44.0, 2262.0], [44.1, 2265.0], [44.2, 2267.0], [44.3, 2272.0], [44.4, 2274.0], [44.5, 2281.0], [44.6, 2284.0], [44.7, 2293.0], [44.8, 2300.0], [44.9, 2302.0], [45.0, 2306.0], [45.1, 2308.0], [45.2, 2310.0], [45.3, 2324.0], [45.4, 2327.0], [45.5, 2331.0], [45.6, 2333.0], [45.7, 2337.0], [45.8, 2351.0], [45.9, 2354.0], [46.0, 2359.0], [46.1, 2363.0], [46.2, 2366.0], [46.3, 2379.0], [46.4, 2381.0], [46.5, 2388.0], [46.6, 2392.0], [46.7, 2395.0], [46.8, 2399.0], [46.9, 2400.0], [47.0, 2401.0], [47.1, 2402.0], [47.2, 2404.0], [47.3, 2408.0], [47.4, 2411.0], [47.5, 2413.0], [47.6, 2416.0], [47.7, 2420.0], [47.8, 2422.0], [47.9, 2427.0], [48.0, 2431.0], [48.1, 2433.0], [48.2, 2435.0], [48.3, 2439.0], [48.4, 2447.0], [48.5, 2459.0], [48.6, 2460.0], [48.7, 2479.0], [48.8, 2485.0], [48.9, 2497.0], [49.0, 2501.0], [49.1, 2508.0], [49.2, 2511.0], [49.3, 2528.0], [49.4, 2531.0], [49.5, 2547.0], [49.6, 2549.0], [49.7, 2555.0], [49.8, 2560.0], [49.9, 2562.0], [50.0, 2564.0], [50.1, 2565.0], [50.2, 2565.0], [50.3, 2569.0], [50.4, 2572.0], [50.5, 2575.0], [50.6, 2576.0], [50.7, 2587.0], [50.8, 2588.0], [50.9, 2597.0], [51.0, 2606.0], [51.1, 2612.0], [51.2, 2620.0], [51.3, 2628.0], [51.4, 2647.0], [51.5, 2660.0], [51.6, 2668.0], [51.7, 2674.0], [51.8, 2687.0], [51.9, 2693.0], [52.0, 2706.0], [52.1, 2708.0], [52.2, 2709.0], [52.3, 2710.0], [52.4, 2711.0], [52.5, 2716.0], [52.6, 2723.0], [52.7, 2726.0], [52.8, 2733.0], [52.9, 2737.0], [53.0, 2744.0], [53.1, 2749.0], [53.2, 2763.0], [53.3, 2765.0], [53.4, 2774.0], [53.5, 2783.0], [53.6, 2784.0], [53.7, 2795.0], [53.8, 2799.0], [53.9, 2803.0], [54.0, 2810.0], [54.1, 2813.0], [54.2, 2818.0], [54.3, 2827.0], [54.4, 2838.0], [54.5, 2844.0], [54.6, 2849.0], [54.7, 2851.0], [54.8, 2858.0], [54.9, 2859.0], [55.0, 2863.0], [55.1, 2869.0], [55.2, 2875.0], [55.3, 2876.0], [55.4, 2885.0], [55.5, 2902.0], [55.6, 2909.0], [55.7, 2932.0], [55.8, 2959.0], [55.9, 2981.0], [56.0, 2995.0], [56.1, 3001.0], [56.2, 3013.0], [56.3, 3017.0], [56.4, 3020.0], [56.5, 3031.0], [56.6, 3042.0], [56.7, 3048.0], [56.8, 3080.0], [56.9, 3085.0], [57.0, 3100.0], [57.1, 3102.0], [57.2, 3112.0], [57.3, 3123.0], [57.4, 3134.0], [57.5, 3138.0], [57.6, 3143.0], [57.7, 3162.0], [57.8, 3165.0], [57.9, 3180.0], [58.0, 3186.0], [58.1, 3196.0], [58.2, 3208.0], [58.3, 3216.0], [58.4, 3219.0], [58.5, 3247.0], [58.6, 3254.0], [58.7, 3262.0], [58.8, 3271.0], [58.9, 3280.0], [59.0, 3299.0], [59.1, 3314.0], [59.2, 3327.0], [59.3, 3334.0], [59.4, 3348.0], [59.5, 3373.0], [59.6, 3383.0], [59.7, 3397.0], [59.8, 3407.0], [59.9, 3413.0], [60.0, 3414.0], [60.1, 3422.0], [60.2, 3430.0], [60.3, 3432.0], [60.4, 3437.0], [60.5, 3471.0], [60.6, 3474.0], [60.7, 3487.0], [60.8, 3489.0], [60.9, 3496.0], [61.0, 3509.0], [61.1, 3513.0], [61.2, 3522.0], [61.3, 3534.0], [61.4, 3538.0], [61.5, 3540.0], [61.6, 3548.0], [61.7, 3552.0], [61.8, 3556.0], [61.9, 3568.0], [62.0, 3572.0], [62.1, 3582.0], [62.2, 3587.0], [62.3, 3593.0], [62.4, 3605.0], [62.5, 3613.0], [62.6, 3615.0], [62.7, 3619.0], [62.8, 3623.0], [62.9, 3626.0], [63.0, 3639.0], [63.1, 3644.0], [63.2, 3646.0], [63.3, 3655.0], [63.4, 3658.0], [63.5, 3665.0], [63.6, 3669.0], [63.7, 3672.0], [63.8, 3676.0], [63.9, 3681.0], [64.0, 3684.0], [64.1, 3697.0], [64.2, 3702.0], [64.3, 3707.0], [64.4, 3717.0], [64.5, 3723.0], [64.6, 3735.0], [64.7, 3745.0], [64.8, 3751.0], [64.9, 3754.0], [65.0, 3757.0], [65.1, 3763.0], [65.2, 3767.0], [65.3, 3771.0], [65.4, 3772.0], [65.5, 3781.0], [65.6, 3784.0], [65.7, 3784.0], [65.8, 3784.0], [65.9, 3789.0], [66.0, 3795.0], [66.1, 3806.0], [66.2, 3806.0], [66.3, 3812.0], [66.4, 3817.0], [66.5, 3824.0], [66.6, 3832.0], [66.7, 3834.0], [66.8, 3836.0], [66.9, 3837.0], [67.0, 3839.0], [67.1, 3841.0], [67.2, 3844.0], [67.3, 3844.0], [67.4, 3847.0], [67.5, 3852.0], [67.6, 3857.0], [67.7, 3861.0], [67.8, 3866.0], [67.9, 3868.0], [68.0, 3869.0], [68.1, 3872.0], [68.2, 3874.0], [68.3, 3875.0], [68.4, 3879.0], [68.5, 3881.0], [68.6, 3888.0], [68.7, 3891.0], [68.8, 3897.0], [68.9, 3902.0], [69.0, 3903.0], [69.1, 3904.0], [69.2, 3915.0], [69.3, 3918.0], [69.4, 3919.0], [69.5, 3922.0], [69.6, 3924.0], [69.7, 3926.0], [69.8, 3928.0], [69.9, 3930.0], [70.0, 3934.0], [70.1, 3939.0], [70.2, 3944.0], [70.3, 3953.0], [70.4, 3954.0], [70.5, 3958.0], [70.6, 3963.0], [70.7, 3964.0], [70.8, 3967.0], [70.9, 3974.0], [71.0, 3975.0], [71.1, 3980.0], [71.2, 3984.0], [71.3, 3992.0], [71.4, 3995.0], [71.5, 3997.0], [71.6, 3999.0], [71.7, 4004.0], [71.8, 4006.0], [71.9, 4009.0], [72.0, 4011.0], [72.1, 4014.0], [72.2, 4016.0], [72.3, 4017.0], [72.4, 4021.0], [72.5, 4022.0], [72.6, 4023.0], [72.7, 4027.0], [72.8, 4034.0], [72.9, 4038.0], [73.0, 4041.0], [73.1, 4044.0], [73.2, 4047.0], [73.3, 4049.0], [73.4, 4049.0], [73.5, 4051.0], [73.6, 4052.0], [73.7, 4053.0], [73.8, 4054.0], [73.9, 4056.0], [74.0, 4058.0], [74.1, 4063.0], [74.2, 4067.0], [74.3, 4069.0], [74.4, 4071.0], [74.5, 4074.0], [74.6, 4076.0], [74.7, 4079.0], [74.8, 4081.0], [74.9, 4086.0], [75.0, 4087.0], [75.1, 4088.0], [75.2, 4091.0], [75.3, 4093.0], [75.4, 4093.0], [75.5, 4096.0], [75.6, 4101.0], [75.7, 4106.0], [75.8, 4107.0], [75.9, 4110.0], [76.0, 4111.0], [76.1, 4115.0], [76.2, 4119.0], [76.3, 4125.0], [76.4, 4129.0], [76.5, 4131.0], [76.6, 4134.0], [76.7, 4135.0], [76.8, 4138.0], [76.9, 4140.0], [77.0, 4142.0], [77.1, 4144.0], [77.2, 4145.0], [77.3, 4146.0], [77.4, 4151.0], [77.5, 4153.0], [77.6, 4154.0], [77.7, 4156.0], [77.8, 4157.0], [77.9, 4159.0], [78.0, 4160.0], [78.1, 4162.0], [78.2, 4163.0], [78.3, 4164.0], [78.4, 4165.0], [78.5, 4166.0], [78.6, 4169.0], [78.7, 4170.0], [78.8, 4175.0], [78.9, 4176.0], [79.0, 4177.0], [79.1, 4180.0], [79.2, 4182.0], [79.3, 4186.0], [79.4, 4188.0], [79.5, 4192.0], [79.6, 4193.0], [79.7, 4194.0], [79.8, 4196.0], [79.9, 4197.0], [80.0, 4199.0], [80.1, 4200.0], [80.2, 4203.0], [80.3, 4206.0], [80.4, 4210.0], [80.5, 4211.0], [80.6, 4212.0], [80.7, 4213.0], [80.8, 4215.0], [80.9, 4219.0], [81.0, 4221.0], [81.1, 4223.0], [81.2, 4226.0], [81.3, 4227.0], [81.4, 4230.0], [81.5, 4236.0], [81.6, 4245.0], [81.7, 4247.0], [81.8, 4253.0], [81.9, 4258.0], [82.0, 4262.0], [82.1, 4265.0], [82.2, 4266.0], [82.3, 4268.0], [82.4, 4275.0], [82.5, 4277.0], [82.6, 4279.0], [82.7, 4280.0], [82.8, 4287.0], [82.9, 4289.0], [83.0, 4297.0], [83.1, 4301.0], [83.2, 4302.0], [83.3, 4304.0], [83.4, 4305.0], [83.5, 4308.0], [83.6, 4312.0], [83.7, 4313.0], [83.8, 4316.0], [83.9, 4318.0], [84.0, 4327.0], [84.1, 4328.0], [84.2, 4329.0], [84.3, 4329.0], [84.4, 4331.0], [84.5, 4332.0], [84.6, 4332.0], [84.7, 4333.0], [84.8, 4337.0], [84.9, 4341.0], [85.0, 4343.0], [85.1, 4346.0], [85.2, 4351.0], [85.3, 4353.0], [85.4, 4358.0], [85.5, 4360.0], [85.6, 4363.0], [85.7, 4367.0], [85.8, 4376.0], [85.9, 4379.0], [86.0, 4386.0], [86.1, 4388.0], [86.2, 4390.0], [86.3, 4393.0], [86.4, 4394.0], [86.5, 4401.0], [86.6, 4404.0], [86.7, 4405.0], [86.8, 4412.0], [86.9, 4418.0], [87.0, 4427.0], [87.1, 4429.0], [87.2, 4430.0], [87.3, 4432.0], [87.4, 4433.0], [87.5, 4438.0], [87.6, 4438.0], [87.7, 4441.0], [87.8, 4445.0], [87.9, 4452.0], [88.0, 4456.0], [88.1, 4461.0], [88.2, 4464.0], [88.3, 4465.0], [88.4, 4470.0], [88.5, 4474.0], [88.6, 4479.0], [88.7, 4480.0], [88.8, 4481.0], [88.9, 4483.0], [89.0, 4485.0], [89.1, 4489.0], [89.2, 4490.0], [89.3, 4498.0], [89.4, 4501.0], [89.5, 4504.0], [89.6, 4518.0], [89.7, 4529.0], [89.8, 4531.0], [89.9, 4532.0], [90.0, 4539.0], [90.1, 4545.0], [90.2, 4548.0], [90.3, 4552.0], [90.4, 4557.0], [90.5, 4561.0], [90.6, 4562.0], [90.7, 4563.0], [90.8, 4567.0], [90.9, 4577.0], [91.0, 4584.0], [91.1, 4591.0], [91.2, 4601.0], [91.3, 4616.0], [91.4, 4616.0], [91.5, 4624.0], [91.6, 4642.0], [91.7, 4646.0], [91.8, 4654.0], [91.9, 4661.0], [92.0, 4665.0], [92.1, 4667.0], [92.2, 4670.0], [92.3, 4678.0], [92.4, 4680.0], [92.5, 4687.0], [92.6, 4693.0], [92.7, 4695.0], [92.8, 4696.0], [92.9, 4702.0], [93.0, 4707.0], [93.1, 4716.0], [93.2, 4722.0], [93.3, 4724.0], [93.4, 4733.0], [93.5, 4740.0], [93.6, 4752.0], [93.7, 4760.0], [93.8, 4766.0], [93.9, 4766.0], [94.0, 4771.0], [94.1, 4782.0], [94.2, 4787.0], [94.3, 4795.0], [94.4, 4799.0], [94.5, 4804.0], [94.6, 4808.0], [94.7, 4814.0], [94.8, 4817.0], [94.9, 4831.0], [95.0, 4839.0], [95.1, 4844.0], [95.2, 4849.0], [95.3, 4861.0], [95.4, 4868.0], [95.5, 4875.0], [95.6, 4880.0], [95.7, 4883.0], [95.8, 4889.0], [95.9, 4897.0], [96.0, 4906.0], [96.1, 4927.0], [96.2, 4933.0], [96.3, 4939.0], [96.4, 4941.0], [96.5, 4944.0], [96.6, 4951.0], [96.7, 4969.0], [96.8, 4973.0], [96.9, 4977.0], [97.0, 4990.0], [97.1, 5003.0], [97.2, 5023.0], [97.3, 5028.0], [97.4, 5045.0], [97.5, 5050.0], [97.6, 5058.0], [97.7, 5076.0], [97.8, 5085.0], [97.9, 5089.0], [98.0, 5093.0], [98.1, 5099.0], [98.2, 5108.0], [98.3, 5119.0], [98.4, 5127.0], [98.5, 5144.0], [98.6, 5152.0], [98.7, 5160.0], [98.8, 5174.0], [98.9, 5181.0], [99.0, 5186.0], [99.1, 5208.0], [99.2, 5255.0], [99.3, 5352.0], [99.4, 5365.0], [99.5, 5392.0], [99.6, 5418.0], [99.7, 5526.0], [99.8, 5530.0], [99.9, 5599.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 115.0, "series": [{"data": [[0.0, 1.0], [600.0, 27.0], [700.0, 42.0], [800.0, 19.0], [900.0, 31.0], [1000.0, 31.0], [1100.0, 26.0], [1200.0, 22.0], [1300.0, 28.0], [1400.0, 31.0], [1500.0, 26.0], [1600.0, 32.0], [1700.0, 48.0], [1800.0, 44.0], [1900.0, 45.0], [2000.0, 28.0], [2100.0, 44.0], [2300.0, 42.0], [2200.0, 45.0], [2400.0, 41.0], [2500.0, 40.0], [2600.0, 20.0], [2800.0, 33.0], [2700.0, 38.0], [2900.0, 11.0], [3000.0, 19.0], [3100.0, 23.0], [3300.0, 14.0], [3200.0, 18.0], [3400.0, 24.0], [3500.0, 28.0], [3600.0, 37.0], [3700.0, 37.0], [3800.0, 56.0], [3900.0, 56.0], [4000.0, 79.0], [4200.0, 60.0], [4100.0, 90.0], [4300.0, 68.0], [4600.0, 33.0], [4500.0, 36.0], [4400.0, 58.0], [4700.0, 32.0], [4800.0, 31.0], [5000.0, 21.0], [5100.0, 18.0], [4900.0, 22.0], [5200.0, 5.0], [5300.0, 5.0], [5500.0, 6.0], [5400.0, 2.0], [5800.0, 1.0], [100.0, 67.0], [200.0, 115.0], [300.0, 55.0], [400.0, 55.0], [500.0, 34.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 5800.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 291.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1416.0, "series": [{"data": [[1.0, 291.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 293.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1416.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 202.56683168316854, "minX": 1.54958304E12, "maxY": 497.5538847117792, "series": [{"data": [[1.54958304E12, 497.5538847117792], [1.5495831E12, 202.56683168316854]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 231.11764705882356, "minX": 1.0, "maxY": 5599.0, "series": [{"data": [[2.0, 4393.0], [3.0, 4135.0], [4.0, 4394.0], [5.0, 4279.0], [6.0, 4287.0], [7.0, 4218.0], [8.0, 4162.0], [10.0, 4417.0], [11.0, 4236.0], [12.0, 4724.0], [13.0, 4462.0], [14.0, 4253.0], [15.0, 4317.0], [16.0, 4329.0], [17.0, 4113.0], [18.0, 4337.0], [19.0, 4330.0], [20.0, 4799.0], [21.0, 4107.0], [23.0, 4242.0], [24.0, 4044.0], [25.0, 5365.0], [26.0, 4213.0], [27.0, 4074.0], [28.0, 4401.0], [29.0, 4074.0], [30.0, 4481.0], [31.0, 2318.5], [33.0, 850.3333333333334], [32.0, 1232.75], [35.0, 1026.0], [34.0, 651.1111111111111], [37.0, 632.4444444444445], [36.0, 609.5], [39.0, 955.8], [38.0, 968.4], [41.0, 620.3333333333333], [40.0, 836.5], [43.0, 614.0], [42.0, 638.1111111111111], [44.0, 1452.0], [45.0, 840.5], [46.0, 1141.5], [47.0, 1586.3333333333333], [48.0, 2195.5], [49.0, 4989.0], [50.0, 1588.0], [51.0, 2233.0], [52.0, 1473.3333333333333], [53.0, 968.2], [54.0, 1501.3333333333333], [55.0, 518.1428571428571], [56.0, 231.11764705882356], [57.0, 998.0], [58.0, 589.8181818181819], [59.0, 969.1666666666667], [60.0, 1611.6666666666667], [61.0, 2453.0], [62.0, 991.4], [63.0, 2270.0], [65.0, 2103.5], [64.0, 2279.5], [67.0, 2701.0], [66.0, 2431.5], [68.0, 2125.5], [69.0, 1868.0], [71.0, 2522.5], [70.0, 4131.0], [74.0, 1704.6666666666665], [75.0, 1238.0], [72.0, 4479.0], [78.0, 1025.0], [77.0, 997.7142857142858], [79.0, 1057.3333333333333], [76.0, 4337.0], [80.0, 1758.6666666666667], [81.0, 2281.5], [82.0, 2319.0], [83.0, 2509.5], [85.0, 1607.3333333333333], [86.0, 1855.3333333333333], [87.0, 4444.0], [84.0, 4670.0], [89.0, 2702.5], [88.0, 2180.5], [91.0, 989.0], [90.0, 3074.0], [93.0, 1401.7142857142858], [92.0, 317.6666666666667], [94.0, 1135.0], [95.0, 798.875], [96.0, 1020.0], [97.0, 398.0], [98.0, 2949.6666666666665], [99.0, 1605.3333333333333], [101.0, 2575.0], [100.0, 2234.0], [102.0, 5085.0], [105.0, 2666.5], [106.0, 2332.5], [107.0, 1660.3333333333333], [104.0, 4277.5], [108.0, 2248.5], [111.0, 3058.3333333333335], [110.0, 462.0], [109.0, 4155.0], [115.0, 2159.5], [114.0, 4452.0], [113.0, 4175.0], [112.0, 3995.0], [117.0, 1300.25], [119.0, 5148.0], [118.0, 4043.0], [116.0, 4070.0], [121.0, 405.0], [120.0, 1698.3333333333333], [123.0, 4081.0], [122.0, 4548.0], [127.0, 2788.0], [126.0, 2798.0], [125.0, 1966.4], [128.0, 2269.0], [130.0, 3208.0], [132.0, 528.6666666666666], [133.0, 2814.6666666666665], [135.0, 4018.5], [131.0, 4485.0], [136.0, 1294.5], [137.0, 389.0], [139.0, 2398.0], [142.0, 2765.0], [143.0, 4328.0], [141.0, 4313.0], [140.0, 4427.0], [138.0, 4576.5], [144.0, 1844.0], [145.0, 2132.5], [148.0, 2251.0], [151.0, 1650.0], [150.0, 4405.0], [149.0, 4387.0], [147.0, 4211.0], [146.0, 4297.0], [153.0, 362.6666666666667], [152.0, 1774.0], [155.0, 1403.0], [156.0, 1508.75], [157.0, 2310.0], [159.0, 4111.0], [158.0, 4665.0], [154.0, 4887.5], [160.0, 2071.333333333333], [162.0, 603.0], [164.0, 1408.0], [163.0, 3035.3333333333335], [165.0, 2399.0], [167.0, 1613.0], [166.0, 2841.5], [161.0, 4971.0], [170.0, 1818.75], [171.0, 2532.0], [173.0, 1648.75], [175.0, 4432.0], [174.0, 4314.0], [172.0, 4276.0], [169.0, 3954.0], [168.0, 4277.0], [176.0, 2519.5], [178.0, 2731.5], [180.0, 2938.0], [183.0, 1153.857142857143], [182.0, 1602.5], [181.0, 2893.0], [179.0, 4760.0], [177.0, 4601.0], [184.0, 2601.0], [186.0, 1656.25], [188.0, 1951.6666666666667], [189.0, 2375.0], [191.0, 4826.0], [190.0, 3928.0], [187.0, 4305.0], [185.0, 3789.0], [195.0, 1512.5], [194.0, 1700.0], [193.0, 2844.0], [199.0, 4246.0], [198.0, 3834.0], [197.0, 3984.0], [196.0, 5108.0], [192.0, 4053.0], [201.0, 1199.142857142857], [200.0, 1839.3333333333333], [206.0, 2115.5], [207.0, 4067.0], [205.0, 4934.0], [204.0, 4210.0], [203.0, 4616.0], [202.0, 4736.0], [210.0, 2626.0], [211.0, 2926.5], [215.0, 1632.6666666666665], [214.0, 1757.0], [213.0, 4185.0], [212.0, 4880.0], [209.0, 3697.0], [208.0, 4642.0], [216.0, 1707.6666666666665], [219.0, 2435.5], [220.0, 2209.333333333333], [221.0, 1919.6666666666667], [222.0, 2743.0], [223.0, 4531.0], [218.0, 4488.0], [217.0, 4134.0], [226.0, 1914.3333333333333], [225.0, 2432.0], [227.0, 2259.0], [231.0, 721.0], [230.0, 4933.0], [229.0, 3841.0], [228.0, 4262.0], [224.0, 4990.0], [232.0, 2676.5], [235.0, 2732.5], [234.0, 2081.333333333333], [233.0, 2330.5], [238.0, 2115.666666666667], [237.0, 2617.5], [239.0, 4927.0], [236.0, 4939.0], [243.0, 3182.6666666666665], [245.0, 2524.0], [247.0, 2775.5], [246.0, 4021.0], [244.0, 4086.0], [241.0, 4024.0], [240.0, 4482.0], [249.0, 2556.25], [248.0, 909.0], [252.0, 1986.5], [251.0, 1986.6666666666667], [250.0, 2534.0], [253.0, 2939.5], [255.0, 2989.0], [254.0, 4177.0], [257.0, 2207.333333333333], [256.0, 2730.0], [258.0, 2916.0], [259.0, 2500.0], [261.0, 1782.75], [260.0, 4531.0], [263.0, 2057.666666666667], [262.0, 2508.5], [265.0, 2526.0], [268.0, 2503.0], [269.0, 3237.0], [271.0, 4667.0], [264.0, 4948.0], [270.0, 3958.0], [266.0, 988.3333333333334], [267.0, 3155.6666666666665], [286.0, 2354.0], [273.0, 2967.0], [275.0, 2509.5], [274.0, 3965.0], [276.0, 2898.5], [277.0, 3920.0], [279.0, 4889.0], [272.0, 4129.0], [278.0, 4329.0], [280.0, 854.0], [281.0, 2333.2], [282.0, 2822.5], [283.0, 3552.0], [287.0, 2214.333333333333], [285.0, 5599.0], [284.0, 4275.0], [300.0, 2670.5], [289.0, 1904.75], [288.0, 1779.25], [290.0, 789.5], [291.0, 4184.0], [294.0, 3198.5], [293.0, 4771.0], [292.0, 3983.0], [296.0, 1694.0], [297.0, 4011.0], [299.0, 4203.0], [298.0, 3868.0], [295.0, 2573.0], [301.0, 2718.0], [302.0, 4740.0], [303.0, 2096.0], [319.0, 4367.0], [304.0, 2999.0], [308.0, 2736.0], [309.0, 5535.0], [311.0, 5526.0], [310.0, 4536.0], [313.0, 2228.0], [312.0, 4226.0], [318.0, 4390.0], [317.0, 4120.0], [316.0, 4011.0], [307.0, 3919.0], [306.0, 4418.0], [305.0, 3880.0], [315.0, 3413.0], [314.0, 4181.0], [323.0, 2599.0], [325.0, 2592.5], [324.0, 927.3333333333334], [328.0, 3211.3333333333335], [327.0, 972.0], [322.0, 4054.0], [321.0, 3724.0], [320.0, 4416.0], [326.0, 3568.0], [331.0, 2175.3333333333335], [330.0, 3904.0], [329.0, 4086.0], [332.0, 2973.0], [333.0, 4724.0], [335.0, 2047.0], [334.0, 2751.5], [348.0, 2319.5], [336.0, 2337.0], [338.0, 2601.5], [337.0, 4199.0], [340.0, 3368.0], [341.0, 4264.0], [342.0, 1830.25], [343.0, 4457.0], [344.0, 1984.0], [345.0, 2230.0], [347.0, 4767.0], [346.0, 5352.0], [350.0, 1368.5], [349.0, 4433.0], [351.0, 3429.3333333333335], [364.0, 2475.5], [352.0, 3217.5], [354.0, 2073.0], [353.0, 3757.0], [355.0, 4194.0], [357.0, 2802.0], [356.0, 3824.0], [359.0, 4563.0], [358.0, 3644.0], [362.0, 2959.0], [361.0, 3906.0], [360.0, 5374.0], [367.0, 4146.0], [366.0, 4702.0], [365.0, 4069.0], [363.0, 4389.0], [382.0, 1795.6666666666665], [368.0, 1940.3333333333333], [370.0, 4017.0], [369.0, 4562.0], [375.0, 4851.0], [374.0, 5093.0], [373.0, 4814.0], [372.0, 4654.0], [371.0, 2474.333333333333], [381.0, 2686.0], [383.0, 2649.0], [380.0, 4023.0], [379.0, 4977.0], [378.0, 3646.0], [377.0, 5352.0], [376.0, 5095.0], [396.0, 3257.0], [391.0, 3178.0], [387.0, 2027.6666666666665], [386.0, 4048.0], [385.0, 4747.0], [390.0, 2751.5], [389.0, 4222.0], [388.0, 3857.0], [394.0, 2617.0], [392.0, 2299.0], [393.0, 2874.5], [395.0, 2709.0], [397.0, 3073.5], [399.0, 4021.0], [398.0, 3903.0], [413.0, 3196.5], [406.0, 3146.5], [405.0, 3194.5], [404.0, 5028.0], [409.0, 3238.0], [408.0, 2353.3333333333335], [410.0, 2330.0], [411.0, 4782.0], [412.0, 2502.0], [407.0, 5152.0], [400.0, 4489.0], [402.0, 3963.0], [401.0, 4693.0], [403.0, 4480.0], [415.0, 4324.0], [414.0, 4379.0], [428.0, 2832.5], [418.0, 3185.0], [419.0, 2960.0], [417.0, 3157.0], [416.0, 4939.0], [423.0, 4883.0], [422.0, 4225.0], [420.0, 2642.0], [421.0, 2290.0], [424.0, 2349.6666666666665], [426.0, 2147.0], [427.0, 4038.0], [425.0, 2513.5], [429.0, 3069.0], [431.0, 2790.0], [430.0, 5269.0], [433.0, 2207.333333333333], [432.0, 3019.5], [434.0, 1833.75], [435.0, 1744.2857142857144], [437.0, 2755.0], [436.0, 2834.5], [439.0, 2392.3333333333335], [438.0, 3795.0], [442.0, 2489.6666666666665], [443.0, 3999.0], [441.0, 2935.0], [440.0, 3217.5], [444.0, 3017.0], [446.0, 4110.0], [445.0, 4490.0], [447.0, 2690.5], [460.0, 2319.5], [450.0, 2699.0], [451.0, 2601.5], [454.0, 3432.0], [453.0, 3924.0], [452.0, 4355.0], [455.0, 1124.0], [449.0, 4568.0], [448.0, 3844.0], [457.0, 2626.6666666666665], [458.0, 3069.0], [459.0, 2756.0], [463.0, 3748.0], [456.0, 4435.0], [462.0, 4393.0], [461.0, 4470.0], [479.0, 4563.0], [466.0, 2670.0], [470.0, 2627.5], [469.0, 4584.0], [468.0, 3918.0], [472.0, 2524.5], [471.0, 2227.0], [465.0, 3784.0], [464.0, 4696.0], [474.0, 2067.6], [473.0, 2578.0], [475.0, 2942.0], [478.0, 4716.0], [477.0, 3162.0], [476.0, 3278.0], [467.0, 4157.0], [493.0, 2722.5], [487.0, 3064.75], [486.0, 1855.0], [485.0, 3561.0], [484.0, 4591.0], [488.0, 2667.0], [491.0, 3241.5], [492.0, 2479.0], [483.0, 4208.0], [482.0, 4304.0], [481.0, 4150.0], [480.0, 4722.0], [494.0, 2978.0], [495.0, 4143.0], [490.0, 4817.0], [489.0, 3437.0], [499.0, 3103.5], [496.0, 2054.8], [498.0, 2907.0], [497.0, 2995.5], [503.0, 2227.0], [502.0, 4360.0], [501.0, 4279.0], [500.0, 4331.0], [505.0, 2024.2857142857142], [504.0, 2491.6666666666665], [506.0, 2444.0], [507.0, 5075.0], [511.0, 1711.0], [510.0, 3536.0], [509.0, 3615.0], [508.0, 4058.0], [536.0, 2737.3333333333335], [513.0, 2586.75], [512.0, 1708.75], [515.0, 2343.5], [514.0, 2830.5], [516.0, 2663.0], [517.0, 4044.0], [519.0, 4166.0], [518.0, 4062.0], [539.0, 2351.0], [541.0, 3147.0], [540.0, 4140.0], [543.0, 3717.0], [542.0, 4436.0], [538.0, 2303.3333333333335], [537.0, 3784.0], [520.0, 2845.5], [521.0, 3137.5], [526.0, 2634.0], [525.0, 4390.0], [524.0, 4091.0], [523.0, 4342.0], [522.0, 4197.0], [530.0, 2687.25], [529.0, 4897.0], [531.0, 3888.0], [532.0, 2848.5], [534.0, 3233.5], [533.0, 4071.0], [528.0, 2853.6666666666665], [550.0, 3074.5], [558.0, 2424.3333333333335], [544.0, 2678.0], [545.0, 2588.5], [549.0, 2728.0], [548.0, 3891.5], [546.0, 4199.0], [560.0, 2358.75], [562.0, 3963.0], [561.0, 4220.0], [564.0, 4787.0], [563.0, 4110.0], [566.0, 4305.0], [565.0, 4848.0], [575.0, 2363.6666666666665], [574.0, 3547.3333333333335], [569.0, 2406.6666666666665], [568.0, 3953.0], [551.0, 4707.0], [571.0, 4157.0], [570.0, 4051.0], [572.0, 2648.3333333333335], [554.0, 2987.5], [553.0, 3358.0], [552.0, 4156.0], [555.0, 2927.5], [557.0, 2900.5], [556.0, 4844.0], [559.0, 2675.5], [602.0, 3069.5], [577.0, 2742.666666666667], [576.0, 2801.0], [591.0, 4783.0], [590.0, 3837.0], [583.0, 2651.3333333333335], [582.0, 3818.0], [581.0, 4661.0], [580.0, 3080.0], [579.0, 2763.0], [578.0, 3814.0], [601.0, 2696.3333333333335], [605.0, 2429.75], [604.0, 3414.0], [603.0, 3626.0], [607.0, 2629.571428571429], [606.0, 1680.6666666666667], [600.0, 3362.5], [584.0, 2769.25], [585.0, 3330.5], [586.0, 3119.0], [588.0, 3893.0], [587.0, 3874.0], [589.0, 3329.0], [592.0, 3226.5], [593.0, 2727.0], [595.0, 4397.0], [594.0, 3958.0], [597.0, 4206.0], [596.0, 3538.0], [599.0, 3197.5], [598.0, 3707.0], [614.0, 2593.5], [609.0, 3197.5], [608.0, 2315.1428571428573], [622.0, 2187.0], [621.0, 4327.0], [620.0, 4170.0], [623.0, 2205.25], [611.0, 3040.5], [610.0, 3751.0], [612.0, 3415.5], [613.0, 2541.25], [625.0, 1998.5], [624.0, 4092.0], [627.0, 3996.0], [626.0, 4083.5], [639.0, 2218.5], [638.0, 2637.5], [637.0, 3342.5], [635.0, 2770.5], [634.0, 3848.0], [636.0, 2867.0], [632.0, 2554.0], [615.0, 3767.0], [633.0, 2757.5], [628.0, 2458.0], [630.0, 3466.5], [629.0, 3828.0], [631.0, 3043.6666666666665], [616.0, 2790.5], [617.0, 3043.0], [618.0, 2812.3333333333335], [619.0, 2690.3333333333335], [666.0, 2689.0], [641.0, 2549.3333333333335], [642.0, 2551.6666666666665], [640.0, 2765.6666666666665], [643.0, 2473.3333333333335], [649.0, 2401.6666666666665], [648.0, 2318.25], [652.0, 3418.5], [651.0, 3494.0], [650.0, 3782.0], [654.0, 3772.0], [653.0, 3936.0], [655.0, 3314.0], [656.0, 2898.0], [658.0, 3406.0], [657.0, 4096.0], [660.0, 4212.0], [659.0, 4376.0], [671.0, 3923.0], [670.0, 3975.0], [669.0, 3665.0], [668.0, 2415.5], [667.0, 2640.0], [665.0, 3428.5], [664.0, 2375.0], [647.0, 3904.0], [646.0, 4358.0], [645.0, 3538.0], [644.0, 3744.0], [662.0, 2482.0], [663.0, 3381.3333333333335], [661.0, 2703.0], [674.0, 2949.0], [683.0, 2468.5], [677.0, 3054.5], [676.0, 4445.0], [675.0, 3418.0], [678.0, 4388.0], [697.0, 3578.5], [679.0, 3556.0], [699.0, 3195.5], [703.0, 4138.0], [702.0, 2737.0], [701.0, 4077.0], [700.0, 4344.0], [681.0, 2700.25], [680.0, 1987.0], [682.0, 2757.6666666666665], [685.0, 2497.75], [687.0, 2532.8], [673.0, 3872.0], [672.0, 3472.0], [686.0, 2153.285714285714], [684.0, 2750.75], [688.0, 2407.6], [689.0, 2572.0], [690.0, 2535.2], [692.0, 3054.0], [691.0, 4039.0], [695.0, 2885.5], [694.0, 3974.5], [709.0, 2284.3333333333335], [705.0, 2882.0], [704.0, 2550.6666666666665], [719.0, 2831.5], [706.0, 2798.3333333333335], [707.0, 2354.2], [710.0, 2975.0], [728.0, 3085.0], [711.0, 4211.0], [729.0, 2475.6], [731.0, 2816.6], [732.0, 2734.5], [734.0, 2904.3333333333335], [735.0, 3179.0], [733.0, 3208.0], [730.0, 2659.3333333333335], [720.0, 2654.0], [722.0, 3490.0], [726.0, 2416.3333333333335], [727.0, 2788.0], [725.0, 2933.0], [724.0, 4034.0], [723.0, 3932.0], [721.0, 2753.3333333333335], [708.0, 3372.5], [718.0, 2548.3333333333335], [717.0, 2462.0], [716.0, 2450.75], [715.0, 2988.6666666666665], [714.0, 3130.0], [713.0, 3844.0], [712.0, 3382.0], [742.0, 3214.0], [736.0, 2873.3333333333335], [740.0, 2723.0], [741.0, 2575.2], [739.0, 2610.0], [738.0, 3613.0], [737.0, 3020.0], [744.0, 2413.0], [743.0, 3408.5], [760.0, 2995.5], [764.0, 3611.0], [767.0, 3489.0], [766.0, 4022.0], [765.0, 2876.0], [763.0, 2522.0], [762.0, 3669.0], [761.0, 2914.0], [753.0, 2521.9999999999995], [754.0, 2912.75], [755.0, 3798.0], [756.0, 3674.0], [757.0, 2652.6], [758.0, 2837.75], [759.0, 3006.5], [752.0, 2365.6666666666665], [745.0, 2087.0], [746.0, 2660.875], [748.0, 3309.0], [747.0, 2246.3333333333335], [749.0, 2295.8], [751.0, 2382.4285714285716], [750.0, 2483.428571428571], [774.0, 2761.8888888888887], [769.0, 2992.25], [768.0, 3110.5], [783.0, 3050.0], [782.0, 4303.0], [781.0, 2384.7272727272725], [780.0, 2546.3076923076924], [778.0, 2540.6428571428573], [779.0, 2634.545454545454], [770.0, 2949.3333333333335], [772.0, 2379.4375], [773.0, 2450.8823529411766], [775.0, 2796.3333333333335], [792.0, 3477.5], [796.0, 2330.0], [797.0, 3206.6], [798.0, 2485.0], [799.0, 4069.0], [795.0, 2744.0], [794.0, 3257.0], [793.0, 3436.0], [784.0, 3114.0], [785.0, 3367.5], [786.0, 3610.5], [789.0, 3212.25], [790.0, 2735.5], [791.0, 2946.5], [788.0, 3424.5], [787.0, 3435.6666666666665], [771.0, 2957.0], [776.0, 2801.5], [777.0, 2944.2], [824.0, 3314.0], [814.0, 2735.0], [806.0, 3725.0], [807.0, 3414.0], [815.0, 3164.0], [800.0, 3990.0], [802.0, 4529.0], [801.0, 3510.0], [805.0, 2765.0], [804.0, 3323.5], [812.0, 3393.5], [811.0, 4265.0], [810.0, 3695.0], [809.0, 3183.0], [808.0, 3000.0], [813.0, 4156.0], [817.0, 3664.0], [821.0, 3151.0], [820.0, 4024.0], [819.0, 3902.0], [818.0, 3430.0], [823.0, 3794.5], [822.0, 3953.0], [827.0, 2482.0], [826.0, 4230.0], [825.0, 3334.5], [828.0, 3167.1428571428573], [829.0, 2778.142857142857], [830.0, 2905.1666666666665], [831.0, 2992.0], [816.0, 3845.0], [834.0, 2703.6], [835.0, 2815.25], [833.0, 3828.0], [836.0, 2795.0], [832.0, 2946.5], [838.0, 4050.0], [837.0, 3422.0], [839.0, 3586.5], [850.0, 2602.5], [849.0, 2844.0], [848.0, 3271.0], [851.0, 2696.0], [852.0, 2251.75], [853.0, 2322.75], [854.0, 2842.25], [841.0, 3555.6666666666665], [840.0, 3875.0], [842.0, 3102.0], [843.0, 3152.0], [847.0, 3568.0], [846.0, 3143.0], [845.0, 4212.0], [844.0, 4160.0], [1.0, 4047.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[437.96649999999937, 2606.5890000000018]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 854.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 1710.2666666666667, "minX": 1.54958304E12, "maxY": 11144.316666666668, "series": [{"data": [[1.54958304E12, 11144.316666666668], [1.5495831E12, 2820.7166666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958304E12, 6756.4], [1.5495831E12, 1710.2666666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 2153.6228070175416, "minX": 1.54958304E12, "maxY": 4396.0297029703015, "series": [{"data": [[1.54958304E12, 2153.6228070175416], [1.5495831E12, 4396.0297029703015]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495831E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 2153.612155388467, "minX": 1.54958304E12, "maxY": 4396.02722772278, "series": [{"data": [[1.54958304E12, 2153.612155388467], [1.5495831E12, 4396.02722772278]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495831E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.2995049504950495, "minX": 1.54958304E12, "maxY": 1.6284461152882206, "series": [{"data": [[1.54958304E12, 1.6284461152882206], [1.5495831E12, 0.2995049504950495]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495831E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 97.0, "minX": 1.54958304E12, "maxY": 5865.0, "series": [{"data": [[1.54958304E12, 5269.0], [1.5495831E12, 5865.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958304E12, 97.0], [1.5495831E12, 3134.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958304E12, 4183.799999999999], [1.5495831E12, 4538.700000000001]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958304E12, 4941.09], [1.5495831E12, 5185.97]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958304E12, 4484.9], [1.5495831E12, 4838.649999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 2073.0, "minX": 6.0, "maxY": 4313.5, "series": [{"data": [[6.0, 4313.5], [26.0, 2073.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 26.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 2073.0, "minX": 6.0, "maxY": 4313.5, "series": [{"data": [[6.0, 4313.5], [26.0, 2073.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 26.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54958304E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54958304E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958304E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 6.733333333333333, "minX": 1.54958304E12, "maxY": 26.6, "series": [{"data": [[1.54958304E12, 26.6], [1.5495831E12, 6.733333333333333]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495831E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 6.733333333333333, "minX": 1.54958304E12, "maxY": 26.6, "series": [{"data": [[1.54958304E12, 26.6], [1.5495831E12, 6.733333333333333]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495831E12, "title": "Transactions Per Second"}},
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
