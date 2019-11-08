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
        data: {"result": {"minY": 1571.0, "minX": 0.0, "maxY": 22840.0, "series": [{"data": [[0.0, 1571.0], [0.1, 1728.0], [0.2, 1813.0], [0.3, 1837.0], [0.4, 1984.0], [0.5, 2146.0], [0.6, 2252.0], [0.7, 2409.0], [0.8, 2448.0], [0.9, 2479.0], [1.0, 2527.0], [1.1, 2664.0], [1.2, 2754.0], [1.3, 2767.0], [1.4, 2843.0], [1.5, 2939.0], [1.6, 2985.0], [1.7, 2991.0], [1.8, 3015.0], [1.9, 3046.0], [2.0, 3104.0], [2.1, 3192.0], [2.2, 3222.0], [2.3, 3251.0], [2.4, 3262.0], [2.5, 3326.0], [2.6, 3336.0], [2.7, 3368.0], [2.8, 3390.0], [2.9, 3413.0], [3.0, 3436.0], [3.1, 3463.0], [3.2, 3483.0], [3.3, 3490.0], [3.4, 3493.0], [3.5, 3522.0], [3.6, 3539.0], [3.7, 3546.0], [3.8, 3568.0], [3.9, 3610.0], [4.0, 3625.0], [4.1, 3651.0], [4.2, 3683.0], [4.3, 3714.0], [4.4, 3737.0], [4.5, 3787.0], [4.6, 3850.0], [4.7, 3857.0], [4.8, 3872.0], [4.9, 3879.0], [5.0, 3897.0], [5.1, 3958.0], [5.2, 4002.0], [5.3, 4022.0], [5.4, 4032.0], [5.5, 4039.0], [5.6, 4048.0], [5.7, 4054.0], [5.8, 4066.0], [5.9, 4082.0], [6.0, 4089.0], [6.1, 4097.0], [6.2, 4107.0], [6.3, 4114.0], [6.4, 4144.0], [6.5, 4161.0], [6.6, 4165.0], [6.7, 4199.0], [6.8, 4216.0], [6.9, 4223.0], [7.0, 4230.0], [7.1, 4270.0], [7.2, 4297.0], [7.3, 4312.0], [7.4, 4318.0], [7.5, 4341.0], [7.6, 4369.0], [7.7, 4376.0], [7.8, 4392.0], [7.9, 4409.0], [8.0, 4460.0], [8.1, 4469.0], [8.2, 4476.0], [8.3, 4483.0], [8.4, 4490.0], [8.5, 4496.0], [8.6, 4515.0], [8.7, 4519.0], [8.8, 4527.0], [8.9, 4532.0], [9.0, 4555.0], [9.1, 4567.0], [9.2, 4572.0], [9.3, 4581.0], [9.4, 4586.0], [9.5, 4595.0], [9.6, 4626.0], [9.7, 4643.0], [9.8, 4672.0], [9.9, 4680.0], [10.0, 4695.0], [10.1, 4716.0], [10.2, 4735.0], [10.3, 4819.0], [10.4, 4831.0], [10.5, 4850.0], [10.6, 4867.0], [10.7, 4879.0], [10.8, 4888.0], [10.9, 4902.0], [11.0, 4911.0], [11.1, 4948.0], [11.2, 4985.0], [11.3, 5011.0], [11.4, 5047.0], [11.5, 5066.0], [11.6, 5106.0], [11.7, 5149.0], [11.8, 5179.0], [11.9, 5193.0], [12.0, 5219.0], [12.1, 5252.0], [12.2, 5258.0], [12.3, 5275.0], [12.4, 5296.0], [12.5, 5341.0], [12.6, 5362.0], [12.7, 5391.0], [12.8, 5396.0], [12.9, 5409.0], [13.0, 5441.0], [13.1, 5491.0], [13.2, 5503.0], [13.3, 5552.0], [13.4, 5583.0], [13.5, 5609.0], [13.6, 5638.0], [13.7, 5662.0], [13.8, 5688.0], [13.9, 5716.0], [14.0, 5750.0], [14.1, 5756.0], [14.2, 5779.0], [14.3, 5799.0], [14.4, 5826.0], [14.5, 5837.0], [14.6, 5859.0], [14.7, 5867.0], [14.8, 5888.0], [14.9, 5917.0], [15.0, 5951.0], [15.1, 5973.0], [15.2, 6013.0], [15.3, 6020.0], [15.4, 6052.0], [15.5, 6072.0], [15.6, 6133.0], [15.7, 6149.0], [15.8, 6157.0], [15.9, 6179.0], [16.0, 6213.0], [16.1, 6231.0], [16.2, 6239.0], [16.3, 6263.0], [16.4, 6273.0], [16.5, 6338.0], [16.6, 6355.0], [16.7, 6378.0], [16.8, 6392.0], [16.9, 6403.0], [17.0, 6418.0], [17.1, 6432.0], [17.2, 6450.0], [17.3, 6460.0], [17.4, 6472.0], [17.5, 6503.0], [17.6, 6519.0], [17.7, 6529.0], [17.8, 6541.0], [17.9, 6552.0], [18.0, 6558.0], [18.1, 6582.0], [18.2, 6619.0], [18.3, 6635.0], [18.4, 6652.0], [18.5, 6692.0], [18.6, 6708.0], [18.7, 6715.0], [18.8, 6726.0], [18.9, 6744.0], [19.0, 6751.0], [19.1, 6769.0], [19.2, 6789.0], [19.3, 6805.0], [19.4, 6814.0], [19.5, 6831.0], [19.6, 6842.0], [19.7, 6865.0], [19.8, 6875.0], [19.9, 6888.0], [20.0, 6900.0], [20.1, 6916.0], [20.2, 6920.0], [20.3, 6935.0], [20.4, 6963.0], [20.5, 6968.0], [20.6, 6982.0], [20.7, 7009.0], [20.8, 7020.0], [20.9, 7031.0], [21.0, 7050.0], [21.1, 7077.0], [21.2, 7090.0], [21.3, 7101.0], [21.4, 7115.0], [21.5, 7140.0], [21.6, 7166.0], [21.7, 7181.0], [21.8, 7204.0], [21.9, 7213.0], [22.0, 7229.0], [22.1, 7266.0], [22.2, 7282.0], [22.3, 7303.0], [22.4, 7318.0], [22.5, 7335.0], [22.6, 7344.0], [22.7, 7360.0], [22.8, 7372.0], [22.9, 7396.0], [23.0, 7414.0], [23.1, 7432.0], [23.2, 7445.0], [23.3, 7455.0], [23.4, 7469.0], [23.5, 7480.0], [23.6, 7496.0], [23.7, 7526.0], [23.8, 7537.0], [23.9, 7558.0], [24.0, 7580.0], [24.1, 7601.0], [24.2, 7610.0], [24.3, 7624.0], [24.4, 7630.0], [24.5, 7641.0], [24.6, 7653.0], [24.7, 7681.0], [24.8, 7692.0], [24.9, 7720.0], [25.0, 7734.0], [25.1, 7741.0], [25.2, 7760.0], [25.3, 7780.0], [25.4, 7800.0], [25.5, 7810.0], [25.6, 7830.0], [25.7, 7842.0], [25.8, 7853.0], [25.9, 7863.0], [26.0, 7883.0], [26.1, 7899.0], [26.2, 7918.0], [26.3, 7930.0], [26.4, 7957.0], [26.5, 7991.0], [26.6, 8023.0], [26.7, 8060.0], [26.8, 8075.0], [26.9, 8094.0], [27.0, 8109.0], [27.1, 8110.0], [27.2, 8129.0], [27.3, 8138.0], [27.4, 8152.0], [27.5, 8167.0], [27.6, 8172.0], [27.7, 8193.0], [27.8, 8213.0], [27.9, 8234.0], [28.0, 8246.0], [28.1, 8264.0], [28.2, 8271.0], [28.3, 8286.0], [28.4, 8317.0], [28.5, 8345.0], [28.6, 8357.0], [28.7, 8376.0], [28.8, 8419.0], [28.9, 8430.0], [29.0, 8444.0], [29.1, 8447.0], [29.2, 8458.0], [29.3, 8474.0], [29.4, 8480.0], [29.5, 8492.0], [29.6, 8495.0], [29.7, 8502.0], [29.8, 8517.0], [29.9, 8532.0], [30.0, 8559.0], [30.1, 8606.0], [30.2, 8618.0], [30.3, 8626.0], [30.4, 8654.0], [30.5, 8662.0], [30.6, 8711.0], [30.7, 8718.0], [30.8, 8738.0], [30.9, 8756.0], [31.0, 8765.0], [31.1, 8785.0], [31.2, 8814.0], [31.3, 8850.0], [31.4, 8859.0], [31.5, 8870.0], [31.6, 8898.0], [31.7, 8929.0], [31.8, 8975.0], [31.9, 9000.0], [32.0, 9012.0], [32.1, 9021.0], [32.2, 9040.0], [32.3, 9065.0], [32.4, 9074.0], [32.5, 9081.0], [32.6, 9101.0], [32.7, 9118.0], [32.8, 9141.0], [32.9, 9151.0], [33.0, 9158.0], [33.1, 9175.0], [33.2, 9189.0], [33.3, 9229.0], [33.4, 9260.0], [33.5, 9272.0], [33.6, 9290.0], [33.7, 9304.0], [33.8, 9323.0], [33.9, 9350.0], [34.0, 9360.0], [34.1, 9395.0], [34.2, 9425.0], [34.3, 9437.0], [34.4, 9469.0], [34.5, 9497.0], [34.6, 9505.0], [34.7, 9529.0], [34.8, 9539.0], [34.9, 9551.0], [35.0, 9568.0], [35.1, 9590.0], [35.2, 9600.0], [35.3, 9613.0], [35.4, 9624.0], [35.5, 9680.0], [35.6, 9714.0], [35.7, 9729.0], [35.8, 9745.0], [35.9, 9774.0], [36.0, 9809.0], [36.1, 9843.0], [36.2, 9871.0], [36.3, 9882.0], [36.4, 9924.0], [36.5, 9938.0], [36.6, 9944.0], [36.7, 9958.0], [36.8, 9973.0], [36.9, 9976.0], [37.0, 10001.0], [37.1, 10021.0], [37.2, 10034.0], [37.3, 10048.0], [37.4, 10064.0], [37.5, 10081.0], [37.6, 10098.0], [37.7, 10123.0], [37.8, 10136.0], [37.9, 10171.0], [38.0, 10183.0], [38.1, 10214.0], [38.2, 10232.0], [38.3, 10238.0], [38.4, 10255.0], [38.5, 10280.0], [38.6, 10303.0], [38.7, 10316.0], [38.8, 10323.0], [38.9, 10358.0], [39.0, 10374.0], [39.1, 10391.0], [39.2, 10407.0], [39.3, 10409.0], [39.4, 10445.0], [39.5, 10476.0], [39.6, 10491.0], [39.7, 10499.0], [39.8, 10514.0], [39.9, 10533.0], [40.0, 10540.0], [40.1, 10564.0], [40.2, 10581.0], [40.3, 10592.0], [40.4, 10603.0], [40.5, 10618.0], [40.6, 10628.0], [40.7, 10631.0], [40.8, 10655.0], [40.9, 10658.0], [41.0, 10668.0], [41.1, 10688.0], [41.2, 10715.0], [41.3, 10728.0], [41.4, 10737.0], [41.5, 10744.0], [41.6, 10756.0], [41.7, 10783.0], [41.8, 10793.0], [41.9, 10826.0], [42.0, 10854.0], [42.1, 10887.0], [42.2, 10908.0], [42.3, 10933.0], [42.4, 10937.0], [42.5, 10942.0], [42.6, 10950.0], [42.7, 10953.0], [42.8, 10956.0], [42.9, 10974.0], [43.0, 10994.0], [43.1, 11014.0], [43.2, 11046.0], [43.3, 11051.0], [43.4, 11065.0], [43.5, 11083.0], [43.6, 11115.0], [43.7, 11124.0], [43.8, 11152.0], [43.9, 11170.0], [44.0, 11215.0], [44.1, 11238.0], [44.2, 11258.0], [44.3, 11279.0], [44.4, 11293.0], [44.5, 11304.0], [44.6, 11314.0], [44.7, 11330.0], [44.8, 11370.0], [44.9, 11394.0], [45.0, 11419.0], [45.1, 11434.0], [45.2, 11440.0], [45.3, 11475.0], [45.4, 11481.0], [45.5, 11502.0], [45.6, 11515.0], [45.7, 11530.0], [45.8, 11555.0], [45.9, 11565.0], [46.0, 11613.0], [46.1, 11642.0], [46.2, 11655.0], [46.3, 11684.0], [46.4, 11701.0], [46.5, 11727.0], [46.6, 11744.0], [46.7, 11758.0], [46.8, 11780.0], [46.9, 11799.0], [47.0, 11837.0], [47.1, 11860.0], [47.2, 11894.0], [47.3, 11918.0], [47.4, 11933.0], [47.5, 11989.0], [47.6, 12009.0], [47.7, 12065.0], [47.8, 12094.0], [47.9, 12128.0], [48.0, 12139.0], [48.1, 12166.0], [48.2, 12180.0], [48.3, 12226.0], [48.4, 12248.0], [48.5, 12261.0], [48.6, 12313.0], [48.7, 12336.0], [48.8, 12351.0], [48.9, 12355.0], [49.0, 12375.0], [49.1, 12407.0], [49.2, 12453.0], [49.3, 12500.0], [49.4, 12505.0], [49.5, 12525.0], [49.6, 12543.0], [49.7, 12566.0], [49.8, 12616.0], [49.9, 12646.0], [50.0, 12678.0], [50.1, 12712.0], [50.2, 12736.0], [50.3, 12742.0], [50.4, 12773.0], [50.5, 12804.0], [50.6, 12821.0], [50.7, 12835.0], [50.8, 12900.0], [50.9, 12943.0], [51.0, 12981.0], [51.1, 13023.0], [51.2, 13078.0], [51.3, 13119.0], [51.4, 13129.0], [51.5, 13148.0], [51.6, 13155.0], [51.7, 13191.0], [51.8, 13212.0], [51.9, 13228.0], [52.0, 13244.0], [52.1, 13259.0], [52.2, 13268.0], [52.3, 13300.0], [52.4, 13320.0], [52.5, 13336.0], [52.6, 13393.0], [52.7, 13404.0], [52.8, 13412.0], [52.9, 13422.0], [53.0, 13434.0], [53.1, 13450.0], [53.2, 13457.0], [53.3, 13465.0], [53.4, 13506.0], [53.5, 13517.0], [53.6, 13523.0], [53.7, 13528.0], [53.8, 13540.0], [53.9, 13554.0], [54.0, 13611.0], [54.1, 13656.0], [54.2, 13682.0], [54.3, 13695.0], [54.4, 13706.0], [54.5, 13726.0], [54.6, 13772.0], [54.7, 13810.0], [54.8, 13818.0], [54.9, 13848.0], [55.0, 13863.0], [55.1, 13908.0], [55.2, 13961.0], [55.3, 14002.0], [55.4, 14012.0], [55.5, 14025.0], [55.6, 14039.0], [55.7, 14085.0], [55.8, 14126.0], [55.9, 14134.0], [56.0, 14145.0], [56.1, 14173.0], [56.2, 14203.0], [56.3, 14213.0], [56.4, 14234.0], [56.5, 14285.0], [56.6, 14319.0], [56.7, 14331.0], [56.8, 14384.0], [56.9, 14409.0], [57.0, 14429.0], [57.1, 14448.0], [57.2, 14481.0], [57.3, 14518.0], [57.4, 14540.0], [57.5, 14558.0], [57.6, 14580.0], [57.7, 14617.0], [57.8, 14643.0], [57.9, 14668.0], [58.0, 14691.0], [58.1, 14767.0], [58.2, 14834.0], [58.3, 14844.0], [58.4, 14865.0], [58.5, 14879.0], [58.6, 14916.0], [58.7, 14978.0], [58.8, 14986.0], [58.9, 14996.0], [59.0, 15037.0], [59.1, 15087.0], [59.2, 15102.0], [59.3, 15143.0], [59.4, 15159.0], [59.5, 15185.0], [59.6, 15200.0], [59.7, 15244.0], [59.8, 15282.0], [59.9, 15317.0], [60.0, 15320.0], [60.1, 15347.0], [60.2, 15381.0], [60.3, 15438.0], [60.4, 15444.0], [60.5, 15541.0], [60.6, 15559.0], [60.7, 15588.0], [60.8, 15617.0], [60.9, 15656.0], [61.0, 15676.0], [61.1, 15693.0], [61.2, 15712.0], [61.3, 15729.0], [61.4, 15741.0], [61.5, 15752.0], [61.6, 15778.0], [61.7, 15844.0], [61.8, 15870.0], [61.9, 15877.0], [62.0, 15892.0], [62.1, 15913.0], [62.2, 15939.0], [62.3, 15956.0], [62.4, 15976.0], [62.5, 16022.0], [62.6, 16043.0], [62.7, 16064.0], [62.8, 16100.0], [62.9, 16117.0], [63.0, 16124.0], [63.1, 16156.0], [63.2, 16178.0], [63.3, 16196.0], [63.4, 16208.0], [63.5, 16228.0], [63.6, 16257.0], [63.7, 16270.0], [63.8, 16300.0], [63.9, 16319.0], [64.0, 16336.0], [64.1, 16365.0], [64.2, 16393.0], [64.3, 16427.0], [64.4, 16434.0], [64.5, 16452.0], [64.6, 16475.0], [64.7, 16506.0], [64.8, 16519.0], [64.9, 16535.0], [65.0, 16580.0], [65.1, 16597.0], [65.2, 16608.0], [65.3, 16633.0], [65.4, 16666.0], [65.5, 16684.0], [65.6, 16699.0], [65.7, 16719.0], [65.8, 16742.0], [65.9, 16763.0], [66.0, 16766.0], [66.1, 16783.0], [66.2, 16791.0], [66.3, 16799.0], [66.4, 16806.0], [66.5, 16829.0], [66.6, 16839.0], [66.7, 16864.0], [66.8, 16896.0], [66.9, 16904.0], [67.0, 16909.0], [67.1, 16934.0], [67.2, 16950.0], [67.3, 16977.0], [67.4, 16989.0], [67.5, 17006.0], [67.6, 17040.0], [67.7, 17072.0], [67.8, 17100.0], [67.9, 17104.0], [68.0, 17110.0], [68.1, 17124.0], [68.2, 17148.0], [68.3, 17160.0], [68.4, 17193.0], [68.5, 17206.0], [68.6, 17224.0], [68.7, 17252.0], [68.8, 17278.0], [68.9, 17284.0], [69.0, 17303.0], [69.1, 17338.0], [69.2, 17345.0], [69.3, 17353.0], [69.4, 17369.0], [69.5, 17400.0], [69.6, 17413.0], [69.7, 17433.0], [69.8, 17443.0], [69.9, 17483.0], [70.0, 17491.0], [70.1, 17501.0], [70.2, 17538.0], [70.3, 17567.0], [70.4, 17589.0], [70.5, 17602.0], [70.6, 17625.0], [70.7, 17639.0], [70.8, 17650.0], [70.9, 17654.0], [71.0, 17664.0], [71.1, 17673.0], [71.2, 17694.0], [71.3, 17711.0], [71.4, 17726.0], [71.5, 17736.0], [71.6, 17755.0], [71.7, 17768.0], [71.8, 17773.0], [71.9, 17788.0], [72.0, 17825.0], [72.1, 17834.0], [72.2, 17845.0], [72.3, 17853.0], [72.4, 17865.0], [72.5, 17881.0], [72.6, 17891.0], [72.7, 17906.0], [72.8, 17911.0], [72.9, 17920.0], [73.0, 17948.0], [73.1, 17964.0], [73.2, 18010.0], [73.3, 18027.0], [73.4, 18039.0], [73.5, 18046.0], [73.6, 18050.0], [73.7, 18064.0], [73.8, 18081.0], [73.9, 18090.0], [74.0, 18095.0], [74.1, 18101.0], [74.2, 18122.0], [74.3, 18128.0], [74.4, 18147.0], [74.5, 18155.0], [74.6, 18174.0], [74.7, 18180.0], [74.8, 18202.0], [74.9, 18206.0], [75.0, 18215.0], [75.1, 18222.0], [75.2, 18240.0], [75.3, 18245.0], [75.4, 18252.0], [75.5, 18272.0], [75.6, 18284.0], [75.7, 18314.0], [75.8, 18346.0], [75.9, 18354.0], [76.0, 18385.0], [76.1, 18403.0], [76.2, 18407.0], [76.3, 18424.0], [76.4, 18450.0], [76.5, 18478.0], [76.6, 18491.0], [76.7, 18514.0], [76.8, 18525.0], [76.9, 18534.0], [77.0, 18551.0], [77.1, 18569.0], [77.2, 18601.0], [77.3, 18612.0], [77.4, 18613.0], [77.5, 18641.0], [77.6, 18667.0], [77.7, 18674.0], [77.8, 18692.0], [77.9, 18713.0], [78.0, 18754.0], [78.1, 18762.0], [78.2, 18778.0], [78.3, 18814.0], [78.4, 18829.0], [78.5, 18843.0], [78.6, 18848.0], [78.7, 18860.0], [78.8, 18885.0], [78.9, 18895.0], [79.0, 18905.0], [79.1, 18924.0], [79.2, 18932.0], [79.3, 18967.0], [79.4, 18993.0], [79.5, 18998.0], [79.6, 19027.0], [79.7, 19041.0], [79.8, 19056.0], [79.9, 19061.0], [80.0, 19077.0], [80.1, 19089.0], [80.2, 19109.0], [80.3, 19125.0], [80.4, 19129.0], [80.5, 19141.0], [80.6, 19155.0], [80.7, 19171.0], [80.8, 19196.0], [80.9, 19211.0], [81.0, 19241.0], [81.1, 19249.0], [81.2, 19292.0], [81.3, 19301.0], [81.4, 19318.0], [81.5, 19340.0], [81.6, 19349.0], [81.7, 19363.0], [81.8, 19381.0], [81.9, 19389.0], [82.0, 19400.0], [82.1, 19410.0], [82.2, 19432.0], [82.3, 19437.0], [82.4, 19448.0], [82.5, 19459.0], [82.6, 19468.0], [82.7, 19496.0], [82.8, 19524.0], [82.9, 19537.0], [83.0, 19562.0], [83.1, 19568.0], [83.2, 19586.0], [83.3, 19596.0], [83.4, 19614.0], [83.5, 19631.0], [83.6, 19649.0], [83.7, 19661.0], [83.8, 19699.0], [83.9, 19708.0], [84.0, 19742.0], [84.1, 19763.0], [84.2, 19794.0], [84.3, 19815.0], [84.4, 19818.0], [84.5, 19829.0], [84.6, 19852.0], [84.7, 19873.0], [84.8, 19888.0], [84.9, 19905.0], [85.0, 19927.0], [85.1, 19942.0], [85.2, 19974.0], [85.3, 19993.0], [85.4, 20019.0], [85.5, 20033.0], [85.6, 20038.0], [85.7, 20054.0], [85.8, 20074.0], [85.9, 20087.0], [86.0, 20102.0], [86.1, 20118.0], [86.2, 20134.0], [86.3, 20149.0], [86.4, 20160.0], [86.5, 20164.0], [86.6, 20176.0], [86.7, 20189.0], [86.8, 20214.0], [86.9, 20253.0], [87.0, 20268.0], [87.1, 20275.0], [87.2, 20294.0], [87.3, 20307.0], [87.4, 20337.0], [87.5, 20353.0], [87.6, 20379.0], [87.7, 20385.0], [87.8, 20399.0], [87.9, 20410.0], [88.0, 20438.0], [88.1, 20446.0], [88.2, 20463.0], [88.3, 20487.0], [88.4, 20523.0], [88.5, 20528.0], [88.6, 20580.0], [88.7, 20593.0], [88.8, 20611.0], [88.9, 20614.0], [89.0, 20625.0], [89.1, 20647.0], [89.2, 20657.0], [89.3, 20662.0], [89.4, 20671.0], [89.5, 20675.0], [89.6, 20692.0], [89.7, 20705.0], [89.8, 20711.0], [89.9, 20722.0], [90.0, 20757.0], [90.1, 20772.0], [90.2, 20789.0], [90.3, 20798.0], [90.4, 20806.0], [90.5, 20822.0], [90.6, 20849.0], [90.7, 20869.0], [90.8, 20890.0], [90.9, 20894.0], [91.0, 20919.0], [91.1, 20945.0], [91.2, 20960.0], [91.3, 20971.0], [91.4, 20974.0], [91.5, 20984.0], [91.6, 20992.0], [91.7, 21013.0], [91.8, 21033.0], [91.9, 21062.0], [92.0, 21085.0], [92.1, 21096.0], [92.2, 21104.0], [92.3, 21140.0], [92.4, 21180.0], [92.5, 21189.0], [92.6, 21223.0], [92.7, 21232.0], [92.8, 21233.0], [92.9, 21240.0], [93.0, 21275.0], [93.1, 21291.0], [93.2, 21311.0], [93.3, 21333.0], [93.4, 21341.0], [93.5, 21354.0], [93.6, 21365.0], [93.7, 21382.0], [93.8, 21392.0], [93.9, 21407.0], [94.0, 21435.0], [94.1, 21467.0], [94.2, 21474.0], [94.3, 21492.0], [94.4, 21520.0], [94.5, 21540.0], [94.6, 21545.0], [94.7, 21567.0], [94.8, 21583.0], [94.9, 21599.0], [95.0, 21605.0], [95.1, 21622.0], [95.2, 21626.0], [95.3, 21654.0], [95.4, 21692.0], [95.5, 21697.0], [95.6, 21714.0], [95.7, 21751.0], [95.8, 21771.0], [95.9, 21798.0], [96.0, 21811.0], [96.1, 21829.0], [96.2, 21851.0], [96.3, 21871.0], [96.4, 21891.0], [96.5, 21906.0], [96.6, 21925.0], [96.7, 21944.0], [96.8, 21977.0], [96.9, 21999.0], [97.0, 22003.0], [97.1, 22020.0], [97.2, 22027.0], [97.3, 22080.0], [97.4, 22106.0], [97.5, 22137.0], [97.6, 22141.0], [97.7, 22151.0], [97.8, 22177.0], [97.9, 22204.0], [98.0, 22231.0], [98.1, 22257.0], [98.2, 22304.0], [98.3, 22321.0], [98.4, 22333.0], [98.5, 22345.0], [98.6, 22361.0], [98.7, 22405.0], [98.8, 22449.0], [98.9, 22481.0], [99.0, 22486.0], [99.1, 22495.0], [99.2, 22524.0], [99.3, 22566.0], [99.4, 22586.0], [99.5, 22622.0], [99.6, 22638.0], [99.7, 22706.0], [99.8, 22755.0], [99.9, 22797.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 1500.0, "maxY": 30.0, "series": [{"data": [[1500.0, 1.0], [1600.0, 1.0], [1700.0, 4.0], [1800.0, 5.0], [1900.0, 2.0], [2000.0, 2.0], [2100.0, 2.0], [2200.0, 2.0], [2300.0, 1.0], [2400.0, 8.0], [2500.0, 4.0], [2600.0, 2.0], [2700.0, 5.0], [2800.0, 3.0], [2900.0, 9.0], [3000.0, 8.0], [3100.0, 4.0], [3200.0, 9.0], [3300.0, 14.0], [3400.0, 18.0], [3500.0, 13.0], [3600.0, 11.0], [3700.0, 9.0], [3800.0, 14.0], [3900.0, 4.0], [4000.0, 30.0], [4200.0, 15.0], [4100.0, 17.0], [4300.0, 18.0], [4400.0, 23.0], [4500.0, 28.0], [4600.0, 16.0], [4700.0, 7.0], [4800.0, 18.0], [4900.0, 11.0], [5000.0, 9.0], [5100.0, 11.0], [5300.0, 12.0], [5200.0, 15.0], [5400.0, 10.0], [5600.0, 11.0], [5500.0, 10.0], [5700.0, 14.0], [5800.0, 16.0], [5900.0, 9.0], [6100.0, 13.0], [6000.0, 12.0], [6300.0, 13.0], [6200.0, 13.0], [6400.0, 18.0], [6500.0, 19.0], [6600.0, 13.0], [6900.0, 20.0], [6700.0, 20.0], [6800.0, 23.0], [7000.0, 19.0], [7100.0, 15.0], [7200.0, 15.0], [7300.0, 20.0], [7400.0, 20.0], [7600.0, 22.0], [7500.0, 14.0], [7900.0, 12.0], [7700.0, 17.0], [7800.0, 22.0], [8000.0, 13.0], [8100.0, 24.0], [8200.0, 17.0], [8400.0, 28.0], [8300.0, 13.0], [8500.0, 11.0], [8600.0, 16.0], [8700.0, 17.0], [8800.0, 14.0], [9200.0, 14.0], [9000.0, 21.0], [8900.0, 8.0], [9100.0, 19.0], [9400.0, 13.0], [9500.0, 19.0], [9600.0, 11.0], [9300.0, 13.0], [9700.0, 12.0], [9800.0, 11.0], [10000.0, 19.0], [9900.0, 20.0], [10100.0, 12.0], [10200.0, 17.0], [10600.0, 23.0], [10500.0, 19.0], [10700.0, 21.0], [10400.0, 17.0], [10300.0, 17.0], [10900.0, 25.0], [11100.0, 13.0], [10800.0, 11.0], [11000.0, 16.0], [11200.0, 15.0], [11300.0, 13.0], [11500.0, 14.0], [11600.0, 13.0], [11400.0, 18.0], [11700.0, 16.0], [11800.0, 9.0], [11900.0, 9.0], [12000.0, 9.0], [12100.0, 12.0], [12200.0, 11.0], [12400.0, 7.0], [12300.0, 14.0], [12500.0, 13.0], [12600.0, 9.0], [12700.0, 14.0], [12800.0, 9.0], [12900.0, 7.0], [13000.0, 8.0], [13100.0, 13.0], [13200.0, 17.0], [13300.0, 11.0], [13400.0, 22.0], [13500.0, 18.0], [13600.0, 11.0], [13700.0, 8.0], [13800.0, 14.0], [13900.0, 6.0], [14100.0, 13.0], [14200.0, 10.0], [14300.0, 9.0], [14000.0, 14.0], [14400.0, 14.0], [14500.0, 12.0], [14800.0, 12.0], [14600.0, 10.0], [14700.0, 4.0], [15300.0, 12.0], [15200.0, 8.0], [15100.0, 12.0], [15000.0, 8.0], [14900.0, 11.0], [15400.0, 6.0], [15600.0, 13.0], [15500.0, 8.0], [15700.0, 14.0], [15800.0, 14.0], [15900.0, 11.0], [16000.0, 10.0], [16100.0, 16.0], [16200.0, 14.0], [16300.0, 14.0], [16400.0, 13.0], [16600.0, 15.0], [17200.0, 16.0], [16800.0, 15.0], [17000.0, 9.0], [17400.0, 17.0], [17600.0, 24.0], [17800.0, 20.0], [18000.0, 28.0], [18400.0, 17.0], [18200.0, 26.0], [18600.0, 19.0], [19200.0, 14.0], [18800.0, 20.0], [19400.0, 24.0], [19000.0, 19.0], [20000.0, 19.0], [19600.0, 15.0], [19800.0, 18.0], [20200.0, 15.0], [20400.0, 15.0], [20600.0, 27.0], [20800.0, 19.0], [21200.0, 18.0], [21000.0, 13.0], [21400.0, 15.0], [21600.0, 18.0], [21800.0, 16.0], [22200.0, 11.0], [22000.0, 13.0], [22400.0, 13.0], [22600.0, 7.0], [22800.0, 2.0], [17300.0, 15.0], [16500.0, 13.0], [16700.0, 21.0], [16900.0, 20.0], [17100.0, 20.0], [17700.0, 21.0], [17500.0, 13.0], [17900.0, 15.0], [18100.0, 21.0], [18300.0, 13.0], [18500.0, 16.0], [18700.0, 13.0], [18900.0, 18.0], [19300.0, 21.0], [19100.0, 20.0], [20100.0, 22.0], [19900.0, 16.0], [19500.0, 16.0], [20300.0, 18.0], [19700.0, 12.0], [21300.0, 21.0], [20500.0, 13.0], [21100.0, 13.0], [20900.0, 22.0], [21500.0, 17.0], [20700.0, 20.0], [22300.0, 15.0], [22100.0, 13.0], [21700.0, 12.0], [21900.0, 15.0], [22500.0, 10.0], [22700.0, 7.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 22800.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 3000.0, "minX": 2.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 3000.0, "series": [{"data": [[2.0, 3000.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 1215.3380000000022, "minX": 1.54961928E12, "maxY": 1215.3380000000022, "series": [{"data": [[1.54961928E12, 1215.3380000000022]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961928E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 1728.0, "minX": 1.0, "maxY": 22840.0, "series": [{"data": [[2.0, 22522.0], [4.0, 21566.5], [6.0, 21443.0], [7.0, 21311.0], [8.0, 21483.0], [9.0, 21100.0], [10.0, 22007.0], [11.0, 22003.0], [12.0, 22724.0], [13.0, 22566.0], [14.0, 21859.0], [15.0, 20881.0], [16.0, 22177.0], [18.0, 22511.5], [19.0, 21906.0], [20.0, 22156.0], [22.0, 21841.0], [24.0, 22490.0], [26.0, 21998.5], [27.0, 22141.0], [28.0, 22809.0], [29.0, 21697.0], [31.0, 21780.0], [33.0, 22345.0], [32.0, 21404.0], [34.0, 21798.0], [37.0, 21851.0], [36.0, 21531.0], [39.0, 21694.5], [41.0, 21575.0], [43.0, 21626.0], [42.0, 21753.0], [45.0, 21088.0], [44.0, 21832.0], [47.0, 22477.0], [46.0, 22840.0], [49.0, 21520.0], [48.0, 21551.0], [51.0, 20777.0], [50.0, 22706.0], [53.0, 21692.0], [52.0, 21703.0], [55.0, 22150.0], [54.0, 20782.0], [57.0, 22797.0], [56.0, 22490.0], [59.0, 21079.0], [58.0, 21933.0], [60.0, 22321.0], [62.0, 21726.5], [66.0, 21026.0], [65.0, 21821.0], [64.0, 20826.5], [71.0, 22330.0], [70.0, 21899.0], [69.0, 21555.0], [68.0, 21255.0], [75.0, 21241.0], [73.0, 22629.0], [72.0, 22755.0], [78.0, 20934.0], [77.0, 21749.0], [83.0, 21829.0], [82.0, 22481.0], [81.0, 22415.0], [80.0, 21011.5], [87.0, 22517.0], [86.0, 21233.0], [85.0, 20701.0], [84.0, 22234.0], [91.0, 20657.0], [90.0, 21292.0], [89.0, 22141.0], [88.0, 22304.0], [95.0, 21953.0], [93.0, 21286.0], [92.0, 22080.0], [99.0, 21036.0], [98.0, 21808.0], [97.0, 20604.0], [96.0, 20896.0], [103.0, 22204.0], [102.0, 22472.0], [101.0, 21837.0], [100.0, 21496.0], [107.0, 20614.0], [106.0, 22449.0], [105.0, 22637.0], [104.0, 22791.0], [111.0, 22151.0], [110.0, 22318.0], [108.0, 21018.0], [115.0, 22080.0], [114.0, 22220.0], [113.0, 21370.0], [112.0, 20797.0], [119.0, 21783.0], [118.0, 21622.0], [117.0, 22257.0], [116.0, 21814.0], [123.0, 20654.0], [122.0, 22791.0], [121.0, 22486.0], [120.0, 22025.0], [127.0, 22137.0], [126.0, 21918.0], [125.0, 21364.0], [124.0, 21380.0], [135.0, 21540.0], [134.0, 21885.0], [133.0, 22202.0], [132.0, 22003.0], [131.0, 21718.5], [129.0, 21341.0], [128.0, 20755.0], [143.0, 20638.0], [142.0, 22558.0], [141.0, 22535.0], [140.0, 22350.0], [139.0, 22111.0], [138.0, 22493.0], [137.0, 21998.0], [136.0, 20660.0], [151.0, 20764.0], [150.0, 21804.0], [148.0, 20662.0], [147.0, 22027.0], [146.0, 21801.5], [144.0, 21233.0], [159.0, 21626.0], [158.0, 21985.0], [157.0, 20985.0], [156.0, 21944.0], [155.0, 22638.0], [154.0, 22361.0], [153.0, 21090.0], [152.0, 20487.0], [167.0, 20641.0], [165.0, 22142.0], [164.0, 21463.0], [163.0, 21492.0], [162.0, 21281.0], [161.0, 22586.0], [160.0, 21365.0], [175.0, 21174.0], [174.0, 21062.0], [173.0, 20945.0], [172.0, 21618.0], [170.0, 21808.0], [168.0, 21599.0], [183.0, 21327.0], [182.0, 21605.0], [181.0, 21962.0], [179.0, 20975.0], [178.0, 20385.0], [177.0, 22359.0], [176.0, 22127.0], [191.0, 21060.0], [190.0, 22405.0], [189.0, 21255.5], [187.0, 20806.0], [186.0, 21716.0], [185.0, 22365.0], [184.0, 21197.0], [199.0, 21354.0], [198.0, 22024.0], [197.0, 22486.0], [196.0, 22337.0], [195.0, 22395.0], [194.0, 22424.0], [193.0, 20614.0], [192.0, 21540.0], [207.0, 20625.0], [206.0, 20651.0], [205.0, 21793.0], [204.0, 20802.0], [203.0, 21153.0], [202.0, 20798.0], [201.0, 22204.0], [200.0, 20389.0], [215.0, 21696.0], [214.0, 20613.0], [213.0, 20692.0], [212.0, 21596.0], [211.0, 20410.0], [210.0, 20772.0], [209.0, 20483.0], [208.0, 22070.0], [223.0, 20849.0], [222.0, 20393.0], [221.0, 20338.0], [220.0, 22308.0], [219.0, 20163.0], [218.0, 22315.0], [217.0, 20893.0], [216.0, 22223.0], [231.0, 20269.0], [230.0, 21127.0], [229.0, 21333.0], [228.0, 21514.0], [227.0, 20761.0], [226.0, 21188.0], [225.0, 21913.0], [224.0, 21360.0], [239.0, 20142.0], [238.0, 20520.0], [237.0, 20797.0], [236.0, 20692.0], [235.0, 20672.0], [234.0, 20713.0], [232.0, 20275.0], [247.0, 21249.0], [246.0, 21743.0], [245.0, 21939.0], [244.0, 21603.0], [243.0, 22012.0], [242.0, 22043.0], [241.0, 22231.0], [240.0, 20891.0], [255.0, 20036.0], [254.0, 21232.0], [253.0, 20307.0], [252.0, 21409.0], [251.0, 21874.0], [250.0, 20593.0], [249.0, 21484.0], [248.0, 22237.0], [270.0, 21384.0], [271.0, 20353.0], [269.0, 21622.0], [268.0, 21999.0], [267.0, 21714.0], [266.0, 20686.0], [265.0, 21407.0], [264.0, 21598.0], [263.0, 20019.0], [257.0, 21467.0], [256.0, 20528.0], [259.0, 20399.0], [258.0, 21626.0], [262.0, 20974.0], [261.0, 20316.0], [260.0, 21398.0], [285.0, 21691.0], [287.0, 21021.5], [284.0, 20414.0], [275.0, 20998.0], [274.0, 21545.0], [273.0, 21335.0], [272.0, 20523.0], [283.0, 20973.0], [282.0, 20722.0], [281.0, 22020.0], [280.0, 21415.0], [279.0, 21468.0], [278.0, 20671.0], [277.0, 21085.0], [276.0, 20843.0], [302.0, 20713.0], [303.0, 20953.0], [301.0, 20815.0], [300.0, 20647.0], [299.0, 21627.0], [298.0, 19993.0], [297.0, 20175.0], [296.0, 21180.0], [295.0, 21345.0], [289.0, 20601.5], [291.0, 21654.0], [290.0, 20971.0], [294.0, 21608.0], [293.0, 21435.0], [292.0, 20054.0], [318.0, 21567.0], [319.0, 20686.0], [317.0, 20029.0], [316.0, 19715.0], [315.0, 19767.0], [314.0, 21275.0], [313.0, 20149.0], [312.0, 21077.0], [311.0, 20024.0], [305.0, 21891.0], [304.0, 19888.0], [307.0, 21851.0], [306.0, 19990.0], [310.0, 20546.0], [309.0, 20163.0], [308.0, 21697.0], [334.0, 19699.0], [335.0, 20849.0], [333.0, 19708.0], [332.0, 21263.0], [331.0, 19942.0], [330.0, 20263.0], [329.0, 21383.0], [328.0, 21102.0], [327.0, 19794.0], [321.0, 20638.0], [320.0, 20097.0], [323.0, 21530.0], [322.0, 20245.0], [326.0, 20274.0], [325.0, 19563.0], [324.0, 20074.0], [350.0, 19643.0], [351.0, 20366.0], [349.0, 19381.0], [348.0, 20033.0], [347.0, 20093.0], [346.0, 19387.0], [345.0, 20984.0], [344.0, 20408.0], [343.0, 20289.0], [337.0, 20379.0], [336.0, 21223.0], [339.0, 20811.0], [338.0, 20979.0], [342.0, 19469.0], [341.0, 20102.0], [340.0, 19830.0], [365.0, 21209.0], [366.0, 19924.0], [364.0, 19751.0], [355.0, 20065.0], [354.0, 19451.0], [353.0, 20044.0], [352.0, 20584.0], [363.0, 20441.0], [362.0, 19334.0], [361.0, 21238.0], [360.0, 20675.0], [359.0, 20079.0], [358.0, 20220.0], [356.0, 19568.0], [382.0, 20111.0], [373.0, 11004.5], [372.0, 21232.0], [375.0, 19631.0], [369.0, 19927.0], [368.0, 19482.5], [371.0, 20167.0], [370.0, 21303.0], [374.0, 20306.0], [383.0, 19970.0], [381.0, 19649.0], [380.0, 21096.0], [379.0, 19810.0], [378.0, 20671.0], [377.0, 20185.0], [376.0, 19596.0], [398.0, 19340.0], [399.0, 18996.0], [397.0, 19311.0], [396.0, 19537.0], [395.0, 20669.0], [394.0, 19391.0], [393.0, 19089.0], [392.0, 20589.0], [391.0, 21042.0], [385.0, 19649.0], [384.0, 20822.0], [387.0, 19527.0], [386.0, 20202.0], [389.0, 20268.0], [388.0, 21140.0], [415.0, 20160.0], [411.0, 10868.5], [414.0, 20965.0], [413.0, 20998.0], [412.0, 19421.0], [403.0, 19252.0], [402.0, 20960.0], [401.0, 20801.0], [400.0, 21231.0], [410.0, 19817.0], [409.0, 19707.0], [408.0, 19588.0], [407.0, 20961.0], [406.0, 19756.0], [405.0, 19815.0], [404.0, 20225.0], [430.0, 18998.0], [421.0, 10616.0], [420.0, 19340.0], [422.0, 19179.0], [423.0, 10298.0], [431.0, 21013.0], [429.0, 20152.0], [428.0, 19387.0], [419.0, 20214.0], [418.0, 19905.0], [417.0, 20956.0], [416.0, 20972.0], [426.0, 20711.0], [425.0, 19129.0], [424.0, 21392.0], [446.0, 10826.5], [432.0, 1728.0], [433.0, 19443.0], [435.0, 20482.0], [434.0, 19974.0], [439.0, 18889.0], [438.0, 20756.0], [437.0, 19594.0], [436.0, 20446.0], [447.0, 19403.0], [445.0, 22299.0], [444.0, 19091.0], [443.0, 19433.0], [442.0, 18872.0], [441.0, 18843.0], [440.0, 20501.0], [462.0, 20719.0], [463.0, 10477.0], [461.0, 19389.0], [460.0, 19129.0], [459.0, 19153.0], [458.0, 18559.0], [457.0, 19049.0], [456.0, 18674.0], [455.0, 20439.0], [449.0, 19991.0], [448.0, 19378.0], [451.0, 20253.0], [450.0, 18857.0], [454.0, 20337.0], [453.0, 20289.0], [452.0, 18731.0], [479.0, 10918.0], [469.0, 10137.5], [468.0, 19701.0], [470.0, 19616.0], [475.0, 10709.0], [477.0, 11853.0], [478.0, 19204.0], [476.0, 18551.0], [467.0, 18848.0], [466.0, 20710.0], [465.0, 19875.5], [471.0, 19077.0], [474.0, 19349.0], [473.0, 20710.0], [472.0, 20335.0], [494.0, 19868.0], [495.0, 19881.0], [493.0, 19171.0], [492.0, 19396.0], [491.0, 19027.0], [490.0, 18354.0], [489.0, 19432.0], [488.0, 20410.0], [487.0, 19731.0], [481.0, 19652.0], [480.0, 19832.0], [483.0, 20376.0], [482.0, 18601.0], [486.0, 19682.0], [485.0, 20463.0], [484.0, 22106.0], [510.0, 18432.0], [511.0, 18885.0], [509.0, 20458.0], [508.0, 18403.0], [507.0, 19041.0], [506.0, 18204.0], [505.0, 18612.0], [504.0, 19033.0], [503.0, 19879.0], [497.0, 18211.0], [496.0, 19613.0], [499.0, 19580.0], [498.0, 20035.0], [502.0, 18247.0], [501.0, 18385.0], [500.0, 18270.0], [542.0, 21871.0], [516.0, 10944.0], [526.0, 19218.0], [514.0, 18150.0], [512.0, 18346.0], [524.0, 18749.5], [522.0, 18045.0], [520.0, 19125.0], [532.0, 10385.5], [540.0, 18341.0], [538.0, 18714.0], [536.0, 19437.0], [518.0, 18976.0], [534.0, 18385.0], [530.0, 19379.0], [528.0, 20087.0], [570.0, 11052.5], [552.0, 10923.5], [556.0, 17904.0], [554.0, 18949.0], [574.0, 19829.0], [568.0, 18860.0], [550.0, 21687.0], [548.0, 18010.0], [546.0, 18932.0], [544.0, 18424.0], [566.0, 19815.0], [564.0, 18202.0], [562.0, 21227.0], [560.0, 18060.0], [558.0, 19568.0], [606.0, 18175.0], [592.0, 10259.0], [604.0, 20890.0], [602.0, 19293.0], [600.0, 17315.0], [582.0, 19215.0], [580.0, 19248.0], [578.0, 18405.0], [576.0, 18075.0], [598.0, 17750.0], [596.0, 19084.0], [594.0, 20126.0], [588.0, 19155.0], [586.0, 20130.0], [584.0, 20611.0], [636.0, 19946.0], [608.0, 10638.5], [610.0, 17969.0], [614.0, 17825.0], [612.0, 18196.0], [632.0, 10150.0], [638.0, 19541.0], [634.0, 19386.0], [630.0, 20869.0], [626.0, 20570.0], [624.0, 17369.0], [622.0, 17148.0], [620.0, 18514.0], [618.0, 20382.0], [616.0, 19650.0], [668.0, 20594.0], [648.0, 11661.5], [650.0, 10341.0], [670.0, 19211.0], [666.0, 17458.0], [664.0, 18569.0], [654.0, 18613.0], [646.0, 17100.0], [644.0, 20303.0], [642.0, 18428.0], [640.0, 22329.0], [652.0, 17663.0], [662.0, 20611.0], [660.0, 17021.0], [658.0, 18307.0], [656.0, 19069.0], [700.0, 18527.0], [672.0, 10223.0], [702.0, 18638.0], [698.0, 19270.0], [678.0, 18829.0], [676.0, 19056.0], [674.0, 18225.0], [694.0, 17349.0], [692.0, 18767.0], [690.0, 19153.0], [688.0, 19126.0], [686.0, 18924.0], [684.0, 18356.0], [682.0, 20114.0], [680.0, 18831.0], [710.0, 10093.0], [730.0, 18352.0], [712.0, 17885.0], [714.0, 18083.0], [716.0, 19524.0], [708.0, 18759.0], [706.0, 17795.0], [704.0, 17964.0], [718.0, 19927.0], [720.0, 18926.0], [722.0, 18705.0], [724.0, 11459.0], [726.0, 18956.0], [734.0, 18926.5], [732.0, 17200.0], [728.0, 18494.0], [764.0, 17350.0], [766.0, 10566.25], [752.0, 18913.0], [754.0, 18481.0], [756.0, 18059.0], [762.0, 17929.0], [760.0, 18205.0], [742.0, 16934.0], [740.0, 18842.0], [738.0, 18252.0], [736.0, 19818.0], [750.0, 19873.0], [748.0, 17103.0], [746.0, 17108.0], [744.0, 19292.0], [758.0, 16381.0], [768.0, 18251.0], [776.0, 10474.5], [778.0, 19064.0], [780.0, 18827.0], [770.0, 18047.0], [772.0, 18478.0], [774.0, 18895.0], [782.0, 18503.0], [792.0, 10537.0], [796.0, 10568.5], [784.0, 19196.0], [786.0, 18813.0], [788.0, 19061.0], [790.0, 18144.0], [798.0, 18191.0], [794.0, 18215.0], [804.0, 17299.0], [802.0, 17831.0], [806.0, 19109.0], [824.0, 18993.0], [826.0, 17686.0], [828.0, 16829.0], [808.0, 10163.5], [810.0, 19330.0], [812.0, 20038.0], [800.0, 19358.0], [814.0, 19712.5], [820.0, 10610.5], [822.0, 18814.0], [818.0, 17990.0], [816.0, 18284.0], [830.0, 17088.0], [838.0, 16916.0], [858.0, 17773.0], [848.0, 18178.0], [850.0, 17066.0], [852.0, 16831.0], [854.0, 9954.0], [836.0, 18245.0], [834.0, 16904.0], [832.0, 17433.0], [846.0, 17118.0], [844.0, 16783.0], [842.0, 17711.0], [840.0, 17235.0], [860.0, 10002.0], [862.0, 17373.0], [866.0, 16805.0], [888.0, 8164.333333333333], [870.0, 17639.0], [868.0, 16926.0], [876.0, 10371.0], [874.0, 16535.0], [872.0, 17911.0], [864.0, 16901.0], [878.0, 16641.0], [886.0, 16545.0], [884.0, 17521.0], [890.0, 16977.0], [892.0, 10204.5], [880.0, 17765.0], [882.0, 16438.0], [894.0, 18012.0], [898.0, 16561.0], [924.0, 17413.0], [902.0, 9955.0], [900.0, 17756.0], [920.0, 17695.0], [922.0, 16307.0], [908.0, 10253.0], [906.0, 17926.0], [904.0, 16602.0], [896.0, 16517.0], [910.0, 16763.0], [914.0, 10198.5], [918.0, 18113.0], [916.0, 16117.0], [926.0, 9746.5], [912.0, 16904.0], [928.0, 15899.0], [942.0, 11016.0], [940.0, 16100.0], [938.0, 18217.0], [936.0, 16434.0], [944.0, 5608.875], [948.0, 10924.0], [946.0, 17465.0], [958.0, 9580.5], [950.0, 8423.333333333332], [952.0, 7700.666666666667], [934.0, 16763.0], [932.0, 16519.0], [930.0, 16699.0], [956.0, 7844.0], [954.0, 11136.5], [964.0, 10538.0], [966.0, 7899.666666666667], [962.0, 7780.666666666666], [986.0, 17633.0], [988.0, 16703.0], [990.0, 15750.0], [968.0, 7615.333333333333], [970.0, 10962.0], [974.0, 8685.666666666668], [960.0, 15987.0], [978.0, 8209.0], [980.0, 16633.0], [982.0, 16877.0], [976.0, 7953.333333333333], [972.0, 9617.5], [992.0, 16531.0], [1020.0, 15244.0], [1002.0, 17664.0], [1000.0, 15225.0], [1004.0, 17338.0], [994.0, 16674.0], [996.0, 18046.0], [998.0, 17144.0], [1006.0, 18115.0], [1008.0, 17193.0], [1010.0, 18039.0], [1012.0, 16319.0], [1014.0, 15697.0], [1022.0, 15563.0], [1018.0, 16068.0], [1016.0, 17881.0], [1032.0, 17589.0], [1072.0, 17640.0], [1084.0, 15877.0], [1076.0, 10196.5], [1028.0, 15318.0], [1024.0, 15444.0], [1036.0, 16149.0], [1052.0, 17570.0], [1048.0, 17639.0], [1044.0, 16203.0], [1040.0, 18692.0], [1056.0, 18667.0], [1060.0, 17611.0], [1064.0, 15408.0], [1068.0, 16365.0], [1080.0, 15509.0], [1100.0, 15848.0], [1088.0, 17696.0], [1092.0, 16941.0], [1096.0, 6854.6], [1140.0, 16178.0], [1136.0, 17848.0], [1144.0, 14865.0], [1148.0, 14331.0], [1120.0, 8962.5], [1132.0, 11096.5], [1128.0, 17483.0], [1124.0, 15892.0], [1104.0, 17949.0], [1108.0, 14747.0], [1112.0, 15127.0], [1116.0, 15676.0], [1208.0, 14009.0], [1200.0, 6861.0], [1164.0, 14791.0], [1160.0, 15665.0], [1156.0, 17628.0], [1184.0, 9772.0], [1188.0, 14329.0], [1212.0, 14909.0], [1204.0, 16677.0], [1192.0, 9007.0], [1196.0, 17145.0], [1168.0, 9025.5], [1172.0, 10632.0], [1176.0, 9506.0], [1180.0, 7630.333333333334], [1152.0, 14285.0], [1220.0, 14204.0], [1216.0, 10864.5], [1244.0, 4370.5], [1236.0, 7010.25], [1232.0, 13710.0], [1240.0, 16043.0], [1224.0, 14155.0], [1228.0, 7140.0], [1272.0, 10231.5], [1276.0, 16300.0], [1248.0, 10569.5], [1252.0, 13668.0], [1256.0, 15295.0], [1260.0, 14985.0], [1268.0, 13897.0], [1264.0, 14520.0], [1280.0, 13494.0], [1288.0, 9424.0], [1308.0, 13063.0], [1304.0, 6945.0], [1296.0, 7970.0], [1300.0, 13154.0], [1284.0, 7380.666666666666], [1292.0, 16431.0], [1328.0, 16025.0], [1332.0, 6889.25], [1336.0, 15885.0], [1312.0, 16149.0], [1340.0, 12716.0], [1316.0, 8168.666666666666], [1320.0, 9106.5], [1324.0, 12903.0], [1348.0, 15874.0], [1344.0, 4902.0], [1372.0, 10319.0], [1368.0, 8802.0], [1364.0, 15693.0], [1360.0, 14558.0], [1352.0, 9260.5], [1356.0, 8737.5], [1380.0, 12810.0], [1376.0, 12825.0], [1404.0, 13508.0], [1400.0, 13300.0], [1388.0, 7860.333333333334], [1384.0, 8023.333333333334], [1392.0, 10595.0], [1396.0, 9057.5], [1460.0, 12353.0], [1468.0, 12007.0], [1440.0, 13219.0], [1444.0, 13852.0], [1448.0, 13023.0], [1464.0, 12113.0], [1456.0, 14357.0], [1420.0, 13444.0], [1416.0, 13818.0], [1412.0, 15022.0], [1408.0, 12350.0], [1436.0, 13314.0], [1432.0, 14542.0], [1428.0, 11477.0], [1424.0, 15328.0], [1452.0, 14335.0], [1528.0, 13076.0], [1504.0, 12163.0], [1508.0, 11502.0], [1512.0, 12883.0], [1532.0, 11422.0], [1524.0, 13201.0], [1520.0, 11684.0], [1472.0, 13817.0], [1476.0, 12363.0], [1480.0, 13130.0], [1484.0, 12407.0], [1496.0, 12703.0], [1492.0, 12504.0], [1488.0, 12255.0], [1516.0, 11918.0], [1540.0, 13399.0], [1588.0, 7874.0], [1584.0, 6842.142857142857], [1536.0, 13382.0], [1544.0, 11293.0], [1564.0, 11860.0], [1560.0, 11475.0], [1556.0, 12608.0], [1552.0, 12642.0], [1580.0, 8317.5], [1576.0, 13079.0], [1572.0, 11049.0], [1568.0, 12336.0], [1596.0, 8226.666666666666], [1592.0, 6628.125], [1608.0, 10948.0], [1612.0, 8874.0], [1600.0, 12631.0], [1628.0, 12507.0], [1604.0, 10658.0], [1648.0, 8632.5], [1652.0, 12355.0], [1656.0, 11481.0], [1660.0, 9397.0], [1632.0, 8947.5], [1640.0, 6964.0], [1636.0, 11974.0], [1644.0, 11215.0], [1620.0, 8400.0], [1616.0, 11282.0], [1624.0, 7604.333333333333], [1664.0, 8757.0], [1684.0, 8159.666666666667], [1688.0, 11675.0], [1692.0, 8351.5], [1712.0, 8467.5], [1676.0, 10601.0], [1672.0, 12236.0], [1668.0, 12211.0], [1720.0, 11395.5], [1716.0, 10721.0], [1724.0, 11795.0], [1708.0, 7308.333333333333], [1704.0, 10477.0], [1700.0, 10280.0], [1696.0, 10096.0], [1680.0, 11380.0], [1740.0, 8275.0], [1784.0, 8255.0], [1728.0, 8811.5], [1732.0, 10503.0], [1736.0, 9944.0], [1756.0, 11469.0], [1752.0, 8125.5], [1764.0, 9958.0], [1760.0, 10953.0], [1788.0, 9967.0], [1768.0, 7639.0], [1772.0, 8673.0], [1780.0, 10811.0], [1776.0, 10929.0], [1748.0, 8062.0], [1744.0, 11085.5], [1804.0, 10940.0], [1796.0, 8052.0], [1792.0, 11118.0], [1820.0, 10942.0], [1800.0, 11048.0], [1840.0, 8541.5], [1844.0, 11800.0], [1848.0, 9680.0], [1852.0, 9584.0], [1824.0, 8653.5], [1828.0, 9981.0], [1832.0, 7967.666666666667], [1836.0, 10747.0], [1808.0, 9669.0], [1812.0, 10756.0], [1816.0, 9586.333333333334], [1860.0, 9729.0], [1856.0, 7545.666666666667], [1880.0, 10209.0], [1884.0, 10048.0], [1864.0, 10081.0], [1868.0, 8715.0], [1904.0, 8178.0], [1908.0, 11315.0], [1912.0, 9871.0], [1916.0, 10565.0], [1892.0, 9000.0], [1888.0, 10103.0], [1896.0, 9469.0], [1900.0, 7698.0], [1872.0, 10303.0], [1876.0, 10322.0], [1924.0, 9604.0], [1920.0, 9714.0], [1928.0, 9141.0], [1948.0, 9041.0], [1944.0, 9568.0], [1940.0, 10501.0], [1936.0, 9875.0], [1932.0, 9568.0], [1968.0, 9395.0], [1976.0, 7432.25], [1952.0, 10408.0], [1980.0, 9262.0], [1972.0, 7828.0], [1956.0, 9166.0], [1960.0, 7981.0], [1964.0, 9429.0], [1996.0, 8111.333333333333], [1984.0, 8496.5], [1988.0, 10133.0], [1992.0, 10440.0], [2012.0, 9031.0], [2032.0, 8167.0], [2036.0, 8814.0], [2040.0, 9578.0], [2044.0, 7964.0], [2020.0, 8231.0], [2024.0, 8252.0], [2028.0, 7417.333333333333], [2016.0, 7645.0], [2000.0, 9021.0], [2004.0, 9947.0], [2008.0, 9161.5], [2064.0, 8275.0], [2048.0, 9539.0], [2104.0, 8129.0], [2056.0, 8032.5], [2072.0, 8718.0], [2112.0, 8852.0], [2160.0, 7810.0], [2168.0, 8068.5], [2144.0, 8853.0], [2152.0, 8317.0], [2120.0, 8016.666666666667], [2128.0, 8301.0], [2136.0, 8267.0], [2080.0, 7166.0], [2088.0, 9017.0], [2096.0, 7980.5], [2176.0, 8398.0], [2184.0, 8355.0], [2232.0, 7614.75], [2192.0, 8094.0], [2200.0, 8003.5], [2240.0, 7661.75], [2216.0, 7966.0], [2208.0, 8424.0], [2224.0, 7883.0], [2073.0, 7747.0], [2049.0, 8765.0], [2057.0, 8850.0], [2065.0, 8621.0], [2105.0, 8929.0], [2113.0, 7440.0], [2169.0, 7540.0], [2161.0, 8692.0], [2153.0, 8654.0], [2145.0, 7899.0], [2121.0, 8432.0], [2129.0, 8376.0], [2137.0, 8135.0], [2081.0, 7548.5], [2089.0, 7106.5], [2097.0, 9227.0], [2185.0, 8098.0], [2177.0, 8001.0], [2193.0, 7770.5], [2241.0, 7413.0], [2201.0, 7589.0], [2217.0, 8441.5], [2209.0, 7780.0], [2225.0, 7534.0], [2233.0, 7960.0], [1077.0, 10794.0], [1073.0, 17772.0], [1085.0, 16319.0], [1057.0, 16086.0], [1061.0, 15079.0], [1065.0, 16905.0], [1081.0, 16115.0], [1025.0, 16124.0], [1029.0, 17110.0], [1033.0, 15328.0], [1037.0, 18156.0], [1053.0, 15859.0], [1049.0, 17914.0], [1045.0, 16118.0], [1041.0, 15629.0], [1069.0, 16788.0], [1093.0, 15741.0], [1113.0, 18033.0], [1117.0, 10584.5], [1089.0, 17101.0], [1097.0, 14835.0], [1101.0, 17788.0], [1137.0, 2909.0], [1141.0, 16301.0], [1145.0, 15920.0], [1149.0, 15485.0], [1129.0, 9703.5], [1125.0, 14742.0], [1121.0, 16742.0], [1133.0, 16269.0], [1105.0, 9356.0], [1109.0, 11173.5], [1205.0, 15382.0], [1173.0, 9041.5], [1201.0, 9852.0], [1165.0, 16178.0], [1213.0, 7123.0], [1185.0, 9925.0], [1189.0, 17342.0], [1193.0, 14995.0], [1197.0, 4879.0], [1169.0, 14233.0], [1177.0, 6945.75], [1181.0, 9396.5], [1153.0, 15438.0], [1157.0, 15154.0], [1221.0, 16478.0], [1225.0, 10153.0], [1245.0, 9278.8], [1241.0, 7160.333333333334], [1237.0, 6861.75], [1233.0, 16452.0], [1269.0, 7478.333333333334], [1265.0, 15185.0], [1273.0, 14310.0], [1277.0, 10939.0], [1249.0, 13433.0], [1253.0, 8634.666666666666], [1257.0, 14986.0], [1261.0, 14482.0], [1229.0, 9419.5], [1285.0, 10720.5], [1333.0, 6661.25], [1305.0, 7040.5], [1297.0, 15547.0], [1301.0, 13554.0], [1281.0, 14448.0], [1309.0, 13129.0], [1289.0, 6299.666666666666], [1293.0, 6764.0], [1313.0, 7476.666666666666], [1329.0, 9820.0], [1337.0, 8530.0], [1341.0, 13861.0], [1317.0, 7789.0], [1321.0, 12955.0], [1325.0, 14190.0], [1349.0, 14126.0], [1345.0, 9780.25], [1353.0, 12678.0], [1373.0, 9090.0], [1369.0, 10589.5], [1361.0, 14033.0], [1365.0, 9197.0], [1357.0, 9063.5], [1385.0, 8699.666666666666], [1389.0, 13297.0], [1381.0, 9546.5], [1397.0, 13429.0], [1393.0, 14005.0], [1401.0, 13706.0], [1377.0, 13451.0], [1405.0, 13166.0], [1465.0, 14134.0], [1441.0, 11633.0], [1445.0, 14384.0], [1449.0, 12261.0], [1469.0, 11751.0], [1461.0, 14234.0], [1457.0, 13410.0], [1409.0, 13402.0], [1413.0, 13836.0], [1417.0, 14580.0], [1421.0, 14039.0], [1437.0, 12981.0], [1433.0, 11789.0], [1429.0, 11837.0], [1425.0, 11275.0], [1453.0, 14331.0], [1529.0, 13410.0], [1505.0, 12505.0], [1509.0, 12736.0], [1513.0, 12065.0], [1533.0, 13419.0], [1525.0, 13465.0], [1521.0, 13412.0], [1473.0, 13911.0], [1477.0, 13558.0], [1485.0, 13534.0], [1501.0, 12624.0], [1497.0, 12646.0], [1493.0, 13772.0], [1489.0, 12835.0], [1517.0, 13078.0], [1541.0, 12094.0], [1589.0, 6909.8], [1585.0, 6996.428571428572], [1549.0, 12625.5], [1537.0, 13457.0], [1565.0, 13148.0], [1561.0, 13228.0], [1557.0, 12261.0], [1553.0, 12009.0], [1597.0, 8326.0], [1577.0, 12485.0], [1573.0, 12158.0], [1569.0, 13130.0], [1581.0, 8118.666666666667], [1593.0, 6524.142857142858], [1613.0, 8941.5], [1601.0, 8998.5], [1605.0, 12500.0], [1609.0, 12334.0], [1629.0, 12297.0], [1657.0, 11763.0], [1649.0, 10951.0], [1661.0, 12269.0], [1633.0, 6945.0], [1637.0, 10937.0], [1641.0, 8357.25], [1645.0, 10708.0], [1625.0, 5690.0], [1621.0, 11799.0], [1617.0, 12518.0], [1677.0, 11555.0], [1713.0, 11655.0], [1669.0, 12227.0], [1665.0, 10780.0], [1673.0, 11294.0], [1693.0, 10581.0], [1721.0, 10374.0], [1717.0, 11837.0], [1697.0, 8407.5], [1725.0, 10539.0], [1709.0, 8211.5], [1705.0, 10210.0], [1701.0, 11913.0], [1681.0, 6870.333333333333], [1685.0, 8471.0], [1689.0, 7713.333333333333], [1733.0, 9843.0], [1737.0, 8206.0], [1729.0, 8695.0], [1749.0, 8062.5], [1757.0, 11434.0], [1753.0, 11532.0], [1741.0, 7975.5], [1761.0, 11439.0], [1789.0, 9774.0], [1781.0, 10933.0], [1777.0, 12405.0], [1785.0, 9175.0], [1769.0, 11108.0], [1773.0, 11238.0], [1765.0, 8524.0], [1745.0, 9420.5], [1801.0, 5179.0], [1793.0, 9339.0], [1797.0, 10307.0], [1821.0, 7762.333333333333], [1805.0, 9915.0], [1841.0, 10757.0], [1845.0, 10688.0], [1849.0, 8160.0], [1853.0, 10628.0], [1825.0, 8374.5], [1829.0, 9323.0], [1833.0, 9702.0], [1837.0, 9764.0], [1809.0, 8576.5], [1813.0, 10954.0], [1817.0, 8127.0], [1865.0, 9505.0], [1869.0, 8480.0], [1857.0, 8286.5], [1881.0, 10177.0], [1885.0, 10136.0], [1861.0, 10226.0], [1909.0, 8377.5], [1905.0, 9354.0], [1913.0, 10603.0], [1917.0, 8055.5], [1889.0, 9296.0], [1893.0, 8321.5], [1897.0, 9365.0], [1901.0, 9081.0], [1873.0, 10320.0], [1877.0, 9995.0], [1925.0, 9529.0], [1977.0, 8002.5], [1921.0, 11558.0], [1929.0, 11228.0], [1949.0, 9566.0], [1945.0, 9254.0], [1941.0, 9622.0], [1937.0, 8793.0], [1933.0, 8151.0], [1969.0, 11124.0], [1973.0, 8062.5], [1953.0, 8611.0], [1981.0, 10409.0], [1957.0, 8889.0], [1961.0, 8860.5], [1965.0, 9167.0], [1997.0, 9862.0], [1993.0, 8738.0], [1985.0, 10034.0], [1989.0, 9932.0], [2013.0, 10604.0], [2033.0, 7583.0], [2037.0, 8047.333333333333], [2041.0, 9011.0], [2045.0, 8918.0], [2017.0, 7591.25], [2021.0, 9960.0], [2025.0, 8234.0], [2029.0, 7858.333333333333], [2001.0, 8565.5], [2005.0, 8831.0], [2009.0, 8620.5], [2058.0, 7468.5], [2050.0, 9144.0], [2098.0, 9141.0], [2106.0, 9154.0], [2066.0, 8532.0], [2074.0, 7029.5], [2114.0, 8934.0], [2170.0, 8149.0], [2146.0, 8866.0], [2154.0, 7592.666666666667], [2130.0, 9063.0], [2138.0, 7841.0], [2122.0, 9003.0], [2082.0, 8538.0], [2090.0, 8950.0], [2178.0, 7974.0], [2186.0, 8656.0], [2234.0, 7701.0], [2194.0, 7487.0], [2202.0, 7392.0], [2242.0, 7644.0], [2210.0, 8183.0], [2218.0, 8440.0], [2226.0, 7319.5], [2155.0, 8194.0], [2075.0, 7888.25], [2067.0, 8032.5], [2051.0, 7712.0], [2059.0, 9615.0], [2107.0, 8474.0], [2115.0, 8944.0], [2171.0, 8720.0], [2163.0, 7970.333333333333], [2147.0, 7793.0], [2123.0, 8282.0], [2131.0, 8508.0], [2139.0, 7671.5], [2083.0, 9040.0], [2091.0, 8458.0], [2099.0, 8559.0], [2187.0, 8116.5], [2179.0, 7353.333333333333], [2195.0, 7932.0], [2203.0, 7630.0], [2243.0, 7899.0], [2219.0, 7946.0], [2211.0, 8213.0], [2227.0, 8447.0], [2235.0, 7653.0], [541.0, 18404.0], [521.0, 10256.5], [527.0, 20164.0], [515.0, 20134.0], [513.0, 19318.0], [519.0, 19018.0], [517.0, 20176.0], [525.0, 18690.0], [537.0, 9992.5], [543.0, 21545.0], [539.0, 19452.0], [535.0, 20063.0], [533.0, 21530.0], [531.0, 18822.0], [529.0, 20261.0], [573.0, 18262.0], [571.0, 10270.0], [575.0, 10585.0], [569.0, 17723.0], [567.0, 20526.0], [565.0, 19614.0], [563.0, 19204.0], [561.0, 21600.0], [559.0, 19466.0], [547.0, 18095.0], [545.0, 21583.0], [551.0, 19459.0], [549.0, 18713.0], [557.0, 19419.0], [555.0, 17768.0], [553.0, 18667.0], [605.0, 21182.0], [607.0, 18253.0], [603.0, 20919.0], [601.0, 19060.0], [599.0, 19575.0], [597.0, 19400.0], [595.0, 18672.0], [593.0, 17906.0], [591.0, 19308.5], [579.0, 18903.0], [577.0, 17667.0], [583.0, 18524.0], [581.0, 18180.0], [589.0, 19241.0], [587.0, 20881.0], [585.0, 18885.0], [639.0, 19316.0], [625.0, 10491.0], [637.0, 18675.0], [635.0, 19355.0], [633.0, 19301.0], [615.0, 17730.0], [613.0, 20450.0], [611.0, 17501.0], [631.0, 19808.0], [629.0, 18209.5], [627.0, 19446.0], [623.0, 19661.0], [621.0, 19400.0], [619.0, 17654.0], [617.0, 20383.0], [669.0, 19059.0], [643.0, 9874.0], [641.0, 18905.0], [647.0, 19901.0], [645.0, 18050.0], [655.0, 19249.0], [653.0, 17948.0], [651.0, 18856.0], [649.0, 18023.0], [665.0, 9640.5], [671.0, 20207.0], [667.0, 20050.0], [663.0, 19907.0], [661.0, 17440.0], [659.0, 20294.0], [657.0, 19041.0], [703.0, 19822.0], [689.0, 10988.0], [701.0, 20184.0], [699.0, 18762.0], [697.0, 18797.5], [679.0, 18984.0], [677.0, 18641.0], [675.0, 17755.0], [673.0, 18457.0], [695.0, 17858.0], [693.0, 18390.0], [691.0, 19905.0], [687.0, 18027.0], [685.0, 18755.0], [683.0, 18994.0], [681.0, 16506.0], [719.0, 17973.0], [735.0, 18314.0], [713.0, 11193.5], [715.0, 18292.0], [717.0, 18450.0], [709.0, 19056.0], [707.0, 19106.0], [705.0, 18643.0], [721.0, 10745.5], [723.0, 18534.0], [725.0, 11567.5], [727.0, 18634.0], [731.0, 19619.0], [729.0, 18315.0], [711.0, 17341.0], [761.0, 17736.0], [767.0, 19610.0], [753.0, 18174.0], [755.0, 18128.0], [757.0, 19363.0], [763.0, 18273.0], [743.0, 18488.0], [741.0, 19133.0], [737.0, 18707.0], [751.0, 18905.0], [749.0, 19437.0], [747.0, 19448.0], [745.0, 19156.0], [759.0, 18089.0], [769.0, 18609.0], [793.0, 9703.0], [775.0, 11048.5], [777.0, 17845.0], [781.0, 17694.0], [783.0, 18101.0], [771.0, 17838.0], [773.0, 19488.0], [799.0, 17910.0], [787.0, 18348.0], [789.0, 19002.0], [791.0, 18222.0], [797.0, 17542.0], [795.0, 18407.0], [803.0, 10534.0], [825.0, 18208.0], [829.0, 10785.0], [801.0, 10734.5], [805.0, 19164.0], [807.0, 20158.0], [827.0, 16862.0], [809.0, 17882.0], [811.0, 18924.0], [813.0, 3336.0], [815.0, 18159.0], [821.0, 10030.5], [823.0, 17711.0], [831.0, 17090.0], [819.0, 17617.0], [857.0, 12422.0], [863.0, 10735.5], [849.0, 10651.0], [851.0, 16759.0], [853.0, 10372.5], [855.0, 10180.5], [839.0, 16981.0], [837.0, 18368.0], [835.0, 16978.0], [833.0, 17834.0], [847.0, 16989.0], [845.0, 17160.0], [843.0, 17554.0], [841.0, 17222.0], [859.0, 17104.0], [861.0, 18122.0], [879.0, 17277.0], [867.0, 10221.5], [871.0, 9661.0], [869.0, 19497.0], [875.0, 16810.0], [873.0, 17006.0], [877.0, 18147.0], [865.0, 17874.0], [883.0, 10553.0], [887.0, 9639.5], [885.0, 18546.0], [889.0, 10780.0], [891.0, 17414.0], [895.0, 16376.0], [881.0, 16774.0], [893.0, 17654.0], [897.0, 17726.0], [899.0, 7765.666666666667], [901.0, 16584.0], [903.0, 16393.0], [921.0, 17404.0], [923.0, 16617.0], [907.0, 10260.0], [905.0, 17538.0], [911.0, 10396.0], [909.0, 16395.0], [919.0, 17491.0], [917.0, 17594.0], [915.0, 16251.0], [927.0, 9775.0], [913.0, 17500.0], [925.0, 17252.0], [929.0, 9441.5], [953.0, 7800.0], [941.0, 17345.0], [939.0, 17280.0], [937.0, 15913.0], [943.0, 17772.0], [947.0, 17040.0], [945.0, 10568.5], [957.0, 4527.0], [959.0, 9484.5], [949.0, 6459.0], [951.0, 7437.75], [935.0, 16608.0], [933.0, 17400.0], [931.0, 19468.0], [955.0, 8314.0], [965.0, 8473.333333333332], [973.0, 7262.25], [967.0, 11421.5], [985.0, 17230.5], [987.0, 18491.0], [989.0, 17891.0], [991.0, 16690.0], [969.0, 10540.5], [961.0, 8217.666666666666], [975.0, 17625.0], [977.0, 18917.0], [979.0, 16701.0], [981.0, 17857.0], [983.0, 18527.0], [971.0, 9910.0], [1007.0, 18612.0], [1003.0, 7352.75], [1001.0, 16013.0], [1005.0, 16427.0], [993.0, 15544.0], [995.0, 16756.0], [997.0, 15347.0], [999.0, 18282.0], [1023.0, 6896.25], [1009.0, 16336.0], [1011.0, 18409.0], [1013.0, 17952.0], [1015.0, 15381.0], [1021.0, 17280.0], [1019.0, 15898.0], [1017.0, 15196.0], [1030.0, 16793.0], [1034.0, 8142.333333333333], [1026.0, 15560.0], [1038.0, 16806.0], [1054.0, 14996.0], [1050.0, 17206.0], [1046.0, 16666.0], [1082.0, 9578.0], [1086.0, 14869.0], [1058.0, 16484.0], [1062.0, 16991.0], [1066.0, 15712.0], [1070.0, 15200.0], [1078.0, 15873.0], [1074.0, 15606.0], [1102.0, 6701.25], [1094.0, 7566.333333333334], [1118.0, 9578.0], [1090.0, 15009.0], [1098.0, 14854.0], [1142.0, 9700.5], [1138.0, 15514.0], [1146.0, 16763.0], [1150.0, 14680.0], [1130.0, 17650.0], [1126.0, 17353.0], [1122.0, 17428.0], [1134.0, 14527.0], [1106.0, 8096.0], [1110.0, 17602.0], [1114.0, 14623.0], [1166.0, 17072.0], [1202.0, 7486.0], [1178.0, 10147.0], [1154.0, 9337.0], [1162.0, 14489.5], [1158.0, 14596.0], [1186.0, 17443.0], [1190.0, 17306.0], [1214.0, 14941.0], [1210.0, 14089.0], [1206.0, 14236.0], [1194.0, 9342.0], [1198.0, 8978.8], [1170.0, 17284.0], [1174.0, 9816.0], [1182.0, 15319.0], [1226.0, 9074.0], [1270.0, 9004.0], [1246.0, 9870.0], [1242.0, 6409.2], [1234.0, 16464.0], [1238.0, 14844.0], [1222.0, 8100.666666666666], [1218.0, 15626.0], [1274.0, 13932.0], [1278.0, 14469.0], [1254.0, 5988.833333333333], [1250.0, 13842.0], [1258.0, 13811.0], [1262.0, 9905.5], [1230.0, 7948.0], [1266.0, 13422.0], [1286.0, 9347.5], [1310.0, 8888.5], [1282.0, 9171.0], [1306.0, 9074.0], [1302.0, 7004.0], [1298.0, 13452.0], [1294.0, 7471.0], [1290.0, 16475.0], [1330.0, 16022.0], [1314.0, 9518.0], [1334.0, 8568.5], [1338.0, 13807.0], [1342.0, 15946.0], [1318.0, 13245.0], [1322.0, 8605.666666666666], [1326.0, 14992.0], [1346.0, 7559.0], [1358.0, 9284.5], [1374.0, 13908.0], [1370.0, 8922.5], [1366.0, 9624.0], [1362.0, 15714.0], [1350.0, 13712.0], [1354.0, 9795.5], [1382.0, 6424.0], [1378.0, 12740.0], [1406.0, 13349.0], [1402.0, 15374.0], [1398.0, 14061.0], [1390.0, 15440.0], [1394.0, 13471.0], [1466.0, 14127.0], [1470.0, 12129.0], [1442.0, 11560.0], [1446.0, 12313.0], [1450.0, 11419.0], [1462.0, 14213.0], [1422.0, 15264.0], [1418.0, 13465.0], [1414.0, 15143.0], [1410.0, 13257.0], [1434.0, 12353.0], [1430.0, 12459.0], [1426.0, 12662.0], [1454.0, 11486.0], [1530.0, 12827.0], [1534.0, 13450.0], [1506.0, 13656.0], [1510.0, 11522.0], [1514.0, 13620.0], [1526.0, 12900.0], [1522.0, 12607.0], [1502.0, 13654.0], [1474.0, 12673.0], [1478.0, 13543.0], [1482.0, 13685.0], [1486.0, 13894.0], [1498.0, 10863.0], [1494.0, 13699.0], [1490.0, 11051.0], [1518.0, 12500.0], [1538.0, 12372.0], [1594.0, 7703.5], [1586.0, 7266.8], [1566.0, 11330.0], [1542.0, 12351.0], [1550.0, 12821.0], [1546.0, 11765.5], [1562.0, 11806.0], [1558.0, 11636.0], [1554.0, 13260.0], [1598.0, 8371.5], [1578.0, 11444.0], [1574.0, 11154.0], [1570.0, 11307.0], [1582.0, 7444.666666666667], [1590.0, 8522.0], [1606.0, 8401.0], [1602.0, 8714.5], [1630.0, 8993.5], [1626.0, 11615.5], [1610.0, 10937.0], [1614.0, 11780.0], [1650.0, 10582.0], [1654.0, 10732.5], [1658.0, 11394.0], [1662.0, 12073.0], [1634.0, 7811.5], [1638.0, 11867.0], [1642.0, 10671.0], [1646.0, 10854.0], [1618.0, 11701.0], [1678.0, 12127.0], [1722.0, 8318.0], [1666.0, 8591.5], [1690.0, 11925.0], [1686.0, 10352.0], [1694.0, 11068.0], [1674.0, 10244.0], [1670.0, 10955.0], [1714.0, 8084.333333333333], [1726.0, 8555.5], [1718.0, 10741.0], [1706.0, 11407.0], [1702.0, 11970.0], [1698.0, 10935.0], [1710.0, 11863.0], [1682.0, 7966.0], [1786.0, 10622.0], [1730.0, 6149.0], [1734.0, 10040.0], [1738.0, 10564.0], [1758.0, 8432.5], [1754.0, 10214.0], [1766.0, 7085.4], [1762.0, 10323.0], [1790.0, 10058.0], [1770.0, 10253.0], [1774.0, 11279.0], [1782.0, 10828.0], [1778.0, 10715.0], [1742.0, 11642.0], [1746.0, 11543.0], [1750.0, 10664.0], [1798.0, 10216.0], [1814.0, 8474.5], [1794.0, 8885.5], [1822.0, 10181.0], [1818.0, 9624.0], [1806.0, 10655.5], [1842.0, 9551.0], [1846.0, 9809.0], [1850.0, 10668.0], [1854.0, 7603.0], [1826.0, 10888.0], [1830.0, 8240.5], [1834.0, 10533.0], [1838.0, 9306.0], [1810.0, 8908.0], [1862.0, 10514.0], [1882.0, 7066.285714285715], [1886.0, 7680.333333333333], [1858.0, 8498.5], [1866.0, 7747.5], [1870.0, 8113.0], [1906.0, 11145.0], [1910.0, 10630.0], [1914.0, 8775.0], [1890.0, 8530.0], [1918.0, 9069.0], [1898.0, 8241.5], [1894.0, 9101.0], [1902.0, 9955.0], [1874.0, 7665.333333333333], [1878.0, 8249.0], [1922.0, 8765.0], [1930.0, 9720.0], [1954.0, 8273.0], [1926.0, 10519.0], [1950.0, 9497.0], [1946.0, 8516.0], [1942.0, 10540.0], [1938.0, 9350.0], [1934.0, 10405.0], [1970.0, 10950.0], [1974.0, 9260.0], [1982.0, 8445.0], [1978.0, 9976.0], [1958.0, 10961.0], [1962.0, 8722.0], [1966.0, 10039.0], [1998.0, 9114.0], [1994.0, 8475.5], [1986.0, 10728.0], [1990.0, 8711.0], [2014.0, 10911.0], [2010.0, 10079.0], [2034.0, 9081.0], [2038.0, 9118.0], [2042.0, 8015.5], [2046.0, 7665.5], [2018.0, 10001.0], [2022.0, 9499.0], [2026.0, 9525.0], [2030.0, 9554.0], [2002.0, 10743.0], [2006.0, 9940.0], [2076.0, 7784.0], [2068.0, 9065.0], [2060.0, 8553.0], [2052.0, 9405.0], [2100.0, 9179.0], [2108.0, 8317.0], [2116.0, 9115.0], [2172.0, 7801.0], [2156.0, 8389.0], [2164.0, 8818.0], [2148.0, 7973.0], [2132.0, 7689.25], [2140.0, 9287.0], [2124.0, 8139.5], [2084.0, 8482.0], [2092.0, 8480.0], [2180.0, 8498.0], [2188.0, 7376.0], [2236.0, 7761.5], [2196.0, 8661.0], [2204.0, 7566.0], [2244.0, 8413.0], [2212.0, 8495.0], [2220.0, 7760.0], [2228.0, 7533.5], [2077.0, 9530.0], [2053.0, 6967.0], [2061.0, 8559.0], [2109.0, 7763.5], [2069.0, 7611.5], [2173.0, 7726.0], [2165.0, 7901.0], [2157.0, 7594.2], [2149.0, 8246.0], [2117.0, 8356.5], [2125.0, 7479.0], [2133.0, 7957.0], [2141.0, 8167.0], [2085.0, 7026.0], [2093.0, 8494.0], [2101.0, 7965.5], [2181.0, 8152.0], [2189.0, 8756.0], [2229.0, 7391.666666666667], [2205.0, 7652.0], [2197.0, 7759.0], [2245.0, 7574.0], [2221.0, 8076.2], [2213.0, 8110.0], [2237.0, 7667.5], [1079.0, 16257.0], [1075.0, 10511.5], [1087.0, 17878.0], [1059.0, 16319.0], [1063.0, 17827.0], [1067.0, 18146.0], [1083.0, 15760.0], [1055.0, 15259.0], [1027.0, 16228.0], [1031.0, 15706.0], [1035.0, 18573.0], [1039.0, 15826.0], [1051.0, 15173.0], [1047.0, 17778.0], [1043.0, 16286.5], [1071.0, 14890.0], [1099.0, 16026.0], [1147.0, 17438.0], [1091.0, 9491.0], [1111.0, 8983.0], [1115.0, 7579.666666666666], [1119.0, 17599.0], [1095.0, 7902.333333333333], [1103.0, 16580.0], [1143.0, 9605.0], [1139.0, 17845.0], [1151.0, 10845.5], [1127.0, 16788.0], [1123.0, 14617.0], [1131.0, 14691.0], [1135.0, 15616.0], [1107.0, 15092.0], [1207.0, 8951.0], [1203.0, 7458.333333333334], [1163.0, 8567.333333333332], [1167.0, 17491.0], [1211.0, 15439.0], [1215.0, 8996.0], [1187.0, 10469.0], [1191.0, 14481.0], [1195.0, 17058.0], [1199.0, 9513.5], [1171.0, 9223.5], [1175.0, 15102.0], [1179.0, 14013.0], [1183.0, 11088.5], [1155.0, 15939.0], [1159.0, 17290.0], [1223.0, 16791.0], [1243.0, 8756.5], [1247.0, 13682.0], [1219.0, 14016.0], [1235.0, 16909.0], [1239.0, 16871.0], [1227.0, 9537.5], [1231.0, 8390.666666666668], [1267.0, 15836.0], [1271.0, 13448.0], [1275.0, 13243.0], [1279.0, 10756.5], [1251.0, 14061.0], [1255.0, 4708.5], [1259.0, 10327.5], [1263.0, 14429.0], [1283.0, 15759.0], [1287.0, 4458.142857142857], [1303.0, 7057.8], [1299.0, 7506.666666666666], [1311.0, 16256.0], [1307.0, 16201.0], [1291.0, 16427.0], [1315.0, 6969.0], [1295.0, 16451.0], [1335.0, 14002.0], [1339.0, 13755.0], [1343.0, 14135.0], [1331.0, 9091.5], [1323.0, 9508.0], [1319.0, 13201.0], [1327.0, 15087.0], [1351.0, 7676.333333333334], [1359.0, 10146.5], [1347.0, 15870.0], [1371.0, 15656.0], [1375.0, 12773.0], [1367.0, 8380.666666666666], [1363.0, 10172.5], [1355.0, 7522.333333333334], [1383.0, 13523.0], [1391.0, 4862.0], [1387.0, 9356.0], [1399.0, 9427.5], [1395.0, 12525.0], [1403.0, 14221.0], [1407.0, 12248.0], [1379.0, 13523.0], [1467.0, 13687.0], [1471.0, 12701.0], [1443.0, 12337.0], [1447.0, 12435.0], [1451.0, 12730.0], [1463.0, 12712.0], [1459.0, 13217.5], [1439.0, 12095.0], [1411.0, 14854.0], [1415.0, 15159.0], [1419.0, 14456.0], [1423.0, 13320.0], [1435.0, 14433.0], [1431.0, 14540.0], [1427.0, 11744.0], [1455.0, 11430.0], [1531.0, 13220.0], [1535.0, 10476.0], [1507.0, 13013.0], [1511.0, 12009.0], [1515.0, 13592.0], [1527.0, 13393.0], [1523.0, 13434.0], [1503.0, 12139.0], [1475.0, 12453.0], [1483.0, 13863.0], [1479.0, 12865.0], [1487.0, 13191.0], [1499.0, 11894.0], [1495.0, 13761.0], [1491.0, 13806.0], [1519.0, 12375.0], [1547.0, 11306.0], [1591.0, 7417.666666666667], [1587.0, 7527.0], [1551.0, 13262.0], [1543.0, 13331.0], [1539.0, 11488.0], [1567.0, 11135.0], [1563.0, 11268.0], [1559.0, 12756.0], [1555.0, 11735.0], [1599.0, 11118.0], [1579.0, 11005.0], [1575.0, 11650.0], [1571.0, 10171.0], [1583.0, 6723.0], [1595.0, 9026.5], [1615.0, 7137.333333333334], [1611.0, 8230.333333333334], [1603.0, 10953.0], [1607.0, 12396.0], [1627.0, 8931.0], [1631.0, 8787.5], [1659.0, 8034.75], [1655.0, 11115.0], [1651.0, 11014.0], [1663.0, 11370.0], [1635.0, 7799.25], [1639.0, 11230.0], [1647.0, 11163.0], [1643.0, 10465.0], [1623.0, 11732.0], [1619.0, 12616.0], [1679.0, 12175.0], [1723.0, 8135.333333333333], [1671.0, 9056.5], [1667.0, 10793.0], [1675.0, 10407.0], [1695.0, 12012.0], [1691.0, 11530.0], [1715.0, 11856.0], [1727.0, 10391.0], [1707.0, 10638.0], [1703.0, 10358.0], [1699.0, 10655.0], [1711.0, 10131.0], [1683.0, 8928.0], [1687.0, 10445.0], [1739.0, 8990.5], [1735.0, 8283.0], [1731.0, 11705.0], [1759.0, 11403.0], [1755.0, 10238.0], [1751.0, 11324.0], [1763.0, 8665.0], [1791.0, 9242.0], [1787.0, 8204.5], [1783.0, 8791.5], [1779.0, 10255.0], [1767.0, 8348.5], [1771.0, 10964.0], [1775.0, 10828.0], [1747.0, 11522.0], [1803.0, 10396.0], [1807.0, 9475.0], [1823.0, 10409.0], [1795.0, 11092.0], [1819.0, 8848.5], [1799.0, 9877.0], [1843.0, 8651.0], [1847.0, 8678.0], [1851.0, 10621.0], [1855.0, 7858.333333333333], [1827.0, 8975.0], [1831.0, 10826.0], [1835.0, 10374.0], [1839.0, 9975.0], [1811.0, 9319.5], [1859.0, 9175.0], [1887.0, 8030.5], [1879.0, 9599.0], [1883.0, 9012.0], [1863.0, 10460.0], [1867.0, 11178.0], [1871.0, 10395.0], [1907.0, 9420.0], [1911.0, 9937.0], [1915.0, 10887.0], [1919.0, 9158.0], [1891.0, 10824.0], [1895.0, 9222.0], [1899.0, 10664.0], [1903.0, 9521.0], [1875.0, 10233.0], [1927.0, 7682.5], [1931.0, 8596.0], [1923.0, 9798.0], [1951.0, 9476.0], [1947.0, 10305.0], [1943.0, 10788.0], [1939.0, 9074.0], [1971.0, 9294.0], [1983.0, 9189.0], [1979.0, 8870.0], [1975.0, 7865.0], [1955.0, 8879.5], [1959.0, 8485.0], [1963.0, 8925.5], [1967.0, 10493.0], [1995.0, 10098.0], [2007.0, 8236.0], [1987.0, 9126.0], [1991.0, 10232.0], [2015.0, 7914.75], [2011.0, 10123.0], [1999.0, 10499.0], [2035.0, 8722.0], [2039.0, 7495.0], [2043.0, 9151.0], [2047.0, 9819.0], [2019.0, 9451.0], [2023.0, 8253.0], [2027.0, 8617.0], [2031.0, 7970.5], [2003.0, 8281.0], [2070.0, 8607.0], [2078.0, 7031.0], [2054.0, 8658.666666666666], [2102.0, 7509.5], [2110.0, 7318.0], [2062.0, 9290.0], [2118.0, 7953.0], [2174.0, 7905.8], [2158.0, 8030.0], [2166.0, 8444.0], [2150.0, 8756.0], [2126.0, 8004.0], [2134.0, 8601.0], [2142.0, 7875.5], [2086.0, 8005.333333333333], [2238.0, 8174.0], [2182.0, 8165.0], [2230.0, 7865.5], [2190.0, 7184.5], [2198.0, 7818.0], [2206.0, 8307.0], [2214.0, 8502.0], [2222.0, 8015.25], [2079.0, 7957.5], [2055.0, 8860.0], [2063.0, 7855.0], [2103.0, 7433.0], [2111.0, 8089.333333333333], [2071.0, 7763.0], [2167.0, 8492.0], [2151.0, 8477.0], [2159.0, 7567.5], [2119.0, 8998.0], [2127.0, 3375.0], [2135.0, 8060.0], [2143.0, 7706.0], [2087.0, 8286.0], [2095.0, 8237.0], [2183.0, 8109.0], [2191.0, 7904.0], [2239.0, 7875.666666666667], [2207.0, 8266.0], [2199.0, 7863.0], [2223.0, 7856.75], [2215.0, 8447.0], [2231.0, 7853.0], [1.0, 22481.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1215.3380000000022, 12871.518333333352]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2245.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 18850.0, "minX": 1.54961928E12, "maxY": 21047.75, "series": [{"data": [[1.54961928E12, 21047.75]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961928E12, 18850.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961928E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 12871.518333333352, "minX": 1.54961928E12, "maxY": 12871.518333333352, "series": [{"data": [[1.54961928E12, 12871.518333333352]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961928E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 12871.49533333333, "minX": 1.54961928E12, "maxY": 12871.49533333333, "series": [{"data": [[1.54961928E12, 12871.49533333333]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961928E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 77.90466666666684, "minX": 1.54961928E12, "maxY": 77.90466666666684, "series": [{"data": [[1.54961928E12, 77.90466666666684]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961928E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 1571.0, "minX": 1.54961928E12, "maxY": 22840.0, "series": [{"data": [[1.54961928E12, 22840.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961928E12, 1571.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961928E12, 20756.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961928E12, 22486.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961928E12, 21604.9]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961928E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 12675.5, "minX": 50.0, "maxY": 12675.5, "series": [{"data": [[50.0, 12675.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 12675.5, "minX": 50.0, "maxY": 12675.5, "series": [{"data": [[50.0, 12675.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 50.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54961928E12, "maxY": 50.0, "series": [{"data": [[1.54961928E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961928E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54961928E12, "maxY": 50.0, "series": [{"data": [[1.54961928E12, 50.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961928E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 50.0, "minX": 1.54961928E12, "maxY": 50.0, "series": [{"data": [[1.54961928E12, 50.0]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961928E12, "title": "Transactions Per Second"}},
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
